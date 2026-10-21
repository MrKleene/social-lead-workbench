// Project-local process-group supervisor. No daemon installation or process discovery.
#include <sys/file.h>
#include <sys/stat.h>
#include <sys/sysctl.h>
#include <sys/wait.h>
#include <poll.h>
#include <signal.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
static volatile sig_atomic_t stopping=0;
static void stop(int sig){(void)sig;stopping=1;}
int main(int argc,char **argv){
 if(argc<4)return 74;
 int inherited=getenv("CRM_SUPERVISED_BOOT")!=NULL;
 int fd=inherited?fcntl(4,F_DUPFD_CLOEXEC,10):open(argv[1],O_CREAT|O_RDWR|O_NOFOLLOW|O_CLOEXEC,0600);struct stat s,e;
 if(fd<0||fstat(fd,&s)||!S_ISREG(s.st_mode)||s.st_uid!=getuid()||(s.st_mode&077)||s.st_nlink!=1)return 74;
 if(!inherited&&flock(fd,LOCK_EX|LOCK_NB))return errno==EWOULDBLOCK?73:74;
 if(lstat(argv[1],&e)||s.st_ino!=e.st_ino||s.st_dev!=e.st_dev)return 74;
 if(inherited)close(4);
 char boot[100]={0};size_t len=sizeof boot;
 if(sysctlbyname("kern.bootsessionuuid",boot,&len,NULL,0)||len>sizeof boot)return 74;
 int life[2];if(pipe(life))return 74;
 // Preserve controller fd 3, lock and lifeline without collisions at dup2 below.
 int lease=fcntl(fd,F_DUPFD_CLOEXEC,10),reader=fcntl(life[0],F_DUPFD_CLOEXEC,10);
 if(lease<0||reader<0)return 74;
 signal(SIGINT,stop);signal(SIGTERM,stop);signal(SIGHUP,stop);signal(SIGPIPE,SIG_IGN);
 char controller[32];snprintf(controller,sizeof controller,"%d",(int)getppid());
 pid_t child=fork();if(child<0)return 74;
 if(child==0){
  if(setsid()<0)_exit(74);
  close(life[1]);close(life[0]);close(fd);
  if(dup2(lease,4)<0||dup2(reader,5)<0)_exit(74);
  close(lease);close(reader);close(3);
  signal(SIGINT,SIG_DFL);signal(SIGTERM,SIG_DFL);signal(SIGHUP,SIG_DFL);signal(SIGPIPE,SIG_DFL);
  setenv("CRM_SUPERVISED_BOOT",boot,1);
  char launcher[32];snprintf(launcher,sizeof launcher,"%d",(int)getppid());
  // Native parent records the JS controller PID separately below.
  setenv("CRM_SUPERVISOR_PID",launcher,1);setenv("CRM_SUPERVISED_LAUNCHER",controller,1);
  execv(argv[2],argv+2);_exit(74);
 }
 close(life[0]);close(reader);close(lease);
 int status=0;siginfo_t info;memset(&info,0,sizeof info);
 while(!stopping){
  // Do not reap the group leader before cleanup; its PID cannot be reused.
  if(waitid(P_PID,(id_t)child,&info,WEXITED|WNOHANG|WNOWAIT)==0&&info.si_pid==child)break;
  struct pollfd ctl={.fd=3,.events=POLLIN|POLLHUP};
  int n=poll(&ctl,1,100);if(n>0&&(ctl.revents&(POLLIN|POLLHUP|POLLERR|POLLNVAL)))stopping=1;
 }
 kill(-child,SIGTERM);
 // Give the normal JS cleanup time, then contain any remaining group members.
 for(int i=0;i<30;i++){
  struct pollfd ctl={.fd=3,.events=POLLIN};
  if(poll(&ctl,1,0)>0&&(ctl.revents&POLLIN)){char cmd[32];ssize_t n=read(3,cmd,sizeof cmd);if(n>0&&memchr(cmd,'K',(size_t)n))break;}
  usleep(100000);
 }
 kill(-child,SIGKILL);
 while(waitpid(child,&status,0)<0&&errno==EINTR){}
 // The flock is retained until no process in the owned group remains.
 // Never unlock the shared description explicitly: inherited leases also protect
 // against this supervisor itself being killed before it can finish cleanup.
 // No more signals after reaping the leader: avoid acting on any reused PGID.
 while(kill(-child,0)==0||errno==EPERM)usleep(100000);
 close(life[1]);close(fd);
 return stopping?0:WIFEXITED(status)?WEXITSTATUS(status):1;
}
