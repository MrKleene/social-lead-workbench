// Desktop operation protocol. Requires Windows native acceptance before enabling.
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
partial class WindowsHost {
 [StructLayout(LayoutKind.Sequential)] struct JobAccounting {public long user,kernel,periodUser,periodKernel;public uint faults,total,active,terminated;}
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int info,out JobAccounting data,uint length,IntPtr returned);
 static bool JobEmpty(IntPtr job){JobAccounting data;if(!QueryInformationJobObject(job,1,out data,(uint)Marshal.SizeOf(typeof(JobAccounting)),IntPtr.Zero))throw new Exception();return data.active==0;}
 static void ClearDesktopTree(string directory){
  // Never follow junctions/symlinks. Only a newly owned private operation tree.
  foreach(string p in Directory.GetFileSystemEntries(directory)){
   FileAttributes attributes=File.GetAttributes(p);
   if((attributes&FileAttributes.ReparsePoint)!=0){if((attributes&FileAttributes.Directory)!=0)Directory.Delete(p);else File.Delete(p);}
   else if((attributes&FileAttributes.Directory)!=0){ClearDesktopTree(p);Directory.Delete(p);}
   else File.Delete(p);
  }
 }
 static int DesktopSupervise(Dictionary<string,object> r){
  string binary=Canonical(Text(r,"binary")),cwd=Canonical(Text(r,"cwd")),guard=Canonical(Text(r,"guard"));
  CheckAcl(binary,false,false);CheckAcl(cwd,true,true);CheckAcl(Path.GetDirectoryName(guard),true,true);
  if(Path.GetDirectoryName(cwd)!=Path.GetDirectoryName(guard))throw new Exception();
  using(var lease=new FileStream(guard,FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None)){
   CheckAcl(guard,false,true);IntPtr job=Job();ProcessInfo pi=new ProcessInfo();bool proven=false;
   try{
    var command=new StringBuilder(Quote(binary));foreach(object a in (System.Collections.IEnumerable)r["args"])command.Append(" "+Quote(Convert.ToString(a)));
    var si=new Startup();si.cb=Marshal.SizeOf(si);
    // Suspended creation closes the race before assignment to kill-on-close Job.
    if(!CreateProcess(binary,command,IntPtr.Zero,IntPtr.Zero,false,0x4|0x08000000,IntPtr.Zero,cwd,ref si,out pi))throw new Exception();
    if(!AssignProcessToJobObject(job,pi.process)){TerminateProcess(pi.process,1);throw new Exception();}
    if(ResumeThread(pi.thread)==0xffffffff){TerminateProcess(pi.process,1);throw new Exception();}
    Console.WriteLine("STARTED "+pi.pid);Console.Out.Flush();
    // The reader must never use a Job handle after the owner closes it.
    // All termination and handle lifetime stay on this supervision thread.
    var control=Task.Run(()=>Console.Read());
    while(WaitForSingleObject(pi.process,100)==258&&!control.IsCompleted){}
    if(!TerminateJobObject(job,1))throw new Exception();
    for(int i=0;i<100&&!JobEmpty(job);i++)Thread.Sleep(100);
    if(!JobEmpty(job))throw new Exception();proven=true;
    uint exit;GetExitCodeProcess(pi.process,out exit);
    if(!control.IsCompleted||control.Result>=0){
     Console.WriteLine("STOPPED "+exit);Console.Out.Flush();
     // Parent seals credentials/retains journal only after this positive proof.
     if(control.Wait(15000)&&control.Result=='T'){var ack=Task.Run(()=>Console.Read());ack.Wait(15000);}
    }
   }finally{
    if(pi.thread!=IntPtr.Zero)CloseHandle(pi.thread);if(pi.process!=IntPtr.Zero)CloseHandle(pi.process);CloseHandle(job);
    if(proven){Directory.SetCurrentDirectory(Path.GetDirectoryName(cwd));ClearDesktopTree(cwd);Directory.Delete(cwd);}
   }
  }
  return 0;
 }
}
