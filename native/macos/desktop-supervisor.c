// Per-operation owned process group. Controller EOF kills the child tree.
// The guard remains held through cleanup; no stored PID is ever signalled.
#include <sys/file.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <poll.h>
#include <signal.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <dirent.h>
#include <time.h>
static volatile sig_atomic_t stopping=0;
static void stop(int sig){(void)sig;stopping=1;}
static long long monotonic_ms(void){struct timespec t;if(clock_gettime(CLOCK_MONOTONIC,&t))return -1;return (long long)t.tv_sec*1000+t.tv_nsec/1000000;}
static void wait_handoff(void){
 long long start=monotonic_ms();if(start<0)return;
 for(;;){long long now=monotonic_ms();if(now<0||now-start>=15000)return;struct pollfd ctl={.fd=3,.events=POLLIN|POLLHUP};int n=poll(&ctl,1,(int)(15000-(now-start)));if(n<0&&errno==EINTR)continue;if(n<=0)return;
  char bytes[32];ssize_t count=read(3,bytes,sizeof bytes);if(count<=0)return;
  // A stop request T can race with natural exit/STOPPED delivery. Only D
  // acknowledges completed parent handoff; T must never authorize cleanup.
  for(ssize_t i=0;i<count;i++)if(bytes[i]=='D')return;
 }
}
static int clear_dir(int fd){
 DIR *dir=fdopendir(dup(fd));if(!dir)return -1;struct dirent *entry;int ok=0;
 while((entry=readdir(dir))){if(!strcmp(entry->d_name,".")||!strcmp(entry->d_name,".."))continue;struct stat s;if(fstatat(fd,entry->d_name,&s,AT_SYMLINK_NOFOLLOW)){ok=-1;break;}
  if(S_ISDIR(s.st_mode)){int child=openat(fd,entry->d_name,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);if(child<0){ok=-1;break;}int result=clear_dir(child);close(child);if(result||unlinkat(fd,entry->d_name,AT_REMOVEDIR)){ok=-1;break;}}
  else if(unlinkat(fd,entry->d_name,0)){ok=-1;break;}
 }closedir(dir);return ok;
}
int main(int argc,char **argv){
 // guard, private ephemeral directory, executable, argument...
 if(argc<5)return 74;
 int guard=open(argv[1],O_CREAT|O_RDWR|O_NOFOLLOW|O_CLOEXEC,0600),session=open(argv[2],O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);struct stat g,s,check;
 if(guard<0||session<0||fstat(guard,&g)||fstat(session,&s)||!S_ISREG(g.st_mode)||g.st_uid!=getuid()||g.st_nlink!=1||(g.st_mode&077)||s.st_uid!=getuid()||(s.st_mode&077))return 74;
 if(flock(guard,LOCK_EX|LOCK_NB))return errno==EWOULDBLOCK?73:74;
 if(lstat(argv[1],&check)||g.st_ino!=check.st_ino||g.st_dev!=check.st_dev)return 74;
 signal(SIGINT,stop);signal(SIGTERM,stop);signal(SIGHUP,stop);signal(SIGPIPE,SIG_IGN);
 int lease=fcntl(guard,F_DUPFD_CLOEXEC,10);if(lease<0)return 74;
 int ready_pipe[2];if(pipe(ready_pipe))return 74;
 pid_t child=fork();if(child<0)return 74;
 if(child==0){
  close(ready_pipe[0]);if(setsid()<0)_exit(74);if(write(ready_pipe[1],"R",1)!=1)_exit(74);close(ready_pipe[1]);close(3);close(guard);close(session);if(dup2(lease,4)<0)_exit(74);close(lease);
  int null=open("/dev/null",O_RDWR);if(null<0)_exit(74);for(int i=0;i<2;i++)if(dup2(null,i)<0)_exit(74);if(null>4)close(null);
  signal(SIGINT,SIG_DFL);signal(SIGTERM,SIG_DFL);signal(SIGHUP,SIG_DFL);signal(SIGPIPE,SIG_DFL);
  execv(argv[3],argv+3);_exit(74);
 }
 close(ready_pipe[1]);char ready_byte;ssize_t ready_count;do{ready_count=read(ready_pipe[0],&ready_byte,1);}while(ready_count<0&&errno==EINTR);close(ready_pipe[0]);if(ready_count!=1||ready_byte!='R'){while(waitpid(child,NULL,0)<0&&errno==EINTR){}return 74;}
 close(lease);dprintf(1,"STARTED %d\n",(int)child);siginfo_t info;memset(&info,0,sizeof info);int status=0,controller_alive=1;
 while(!stopping){if(waitid(P_PID,(id_t)child,&info,WEXITED|WNOHANG|WNOWAIT)==0&&info.si_pid==child)break;struct pollfd ctl={.fd=3,.events=POLLIN|POLLHUP};int n=poll(&ctl,1,100);if(n>0&&(ctl.revents&(POLLIN|POLLHUP|POLLERR|POLLNVAL))){char b[32];ssize_t count=read(3,b,sizeof b);if(count<=0)controller_alive=0;stopping=1;}}
 kill(-child,SIGTERM);for(int i=0;i<15;i++)usleep(100000);kill(-child,SIGKILL);
 while(waitpid(child,&status,0)<0&&errno==EINTR){}
 while(kill(-child,0)==0||errno==EPERM)usleep(100000);
 // Save credentials only after a positive stop proof. Parent gets <=15 seconds
 // to seal the final file; EOF or timeout cleans up even if the parent crashes.
 if(controller_alive){char ready[64];snprintf(ready,sizeof ready,"STOPPED %d\n",WIFEXITED(status)?WEXITSTATUS(status):-WTERMSIG(status));if(write(1,ready,strlen(ready))>0){wait_handoff();}}
 int cleaned=clear_dir(session);close(session);if(!cleaned){if(lstat(argv[2],&check)||check.st_ino!=s.st_ino||check.st_dev!=s.st_dev||rmdir(argv[2]))cleaned=-1;}
 close(guard);return cleaned?74:0;
}
