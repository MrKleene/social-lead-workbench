// Built locally with Windows .NET Framework 4.8 csc. No PowerShell policy changes,
// service installation, elevation, downloads, or secret arguments.
using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Threading.Tasks;

partial class WindowsHost {
 static readonly SecurityIdentifier User = WindowsIdentity.GetCurrent().User;
 static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 32768 };
 static string Text(Dictionary<string,object> r,string k) { return r.ContainsKey(k)?Convert.ToString(r[k]):""; }
 static string ReadLine() { var b=new StringBuilder(); int c; while((c=Console.Read())!=-1&&c!='\n'){if(b.Length>=32768)throw new Exception();b.Append((char)c);}return b.ToString(); }
 static void Reply(string value) { Console.WriteLine(Json.Serialize(new {value=value})); Console.Out.Flush(); }
 static string Canonical(string p) {
  if(String.IsNullOrEmpty(p)||p.Length>240||p.Length<3||!Char.IsLetter(p[0])||p[1]!=':'||p[2]!='\\'||p.IndexOf('/')>=0||p.Substring(2).IndexOf(':')>=0||p.IndexOfAny(new[]{'"','<','>','|','?','*'})>=0)throw new Exception();
  foreach(var part in p.Substring(3).Split('\\'))if(part.Length==0||part.EndsWith(".")||part.EndsWith(" ")||part==".."||part==".")throw new Exception();
  if(!String.Equals(Path.GetFullPath(p),p,StringComparison.OrdinalIgnoreCase))throw new Exception();
  if(System.Text.RegularExpressions.Regex.IsMatch(p,@"\\(?:Public|OneDrive[^\\]*|Dropbox[^\\]*|Google Drive|CloudStorage)(?:\\|$)",System.Text.RegularExpressions.RegexOptions.IgnoreCase))throw new Exception();
  var drive=new DriveInfo(Path.GetPathRoot(p));
  if(drive.DriveType!=DriveType.Fixed||drive.DriveFormat!="NTFS"||!String.Equals(drive.Name,Path.GetPathRoot(Environment.SystemDirectory),StringComparison.OrdinalIgnoreCase))throw new Exception();
  string at=Path.GetPathRoot(p);foreach(var part in p.Substring(3).Split('\\')){at=Path.Combine(at,part);if(Directory.Exists(at)||File.Exists(at)){if((File.GetAttributes(at)&FileAttributes.ReparsePoint)!=0)throw new Exception();}}
  return p;
 }
 static bool Under(string root,string p){return p.StartsWith(root.TrimEnd('\\')+"\\",StringComparison.OrdinalIgnoreCase);}
 static void PrivateArea(string p){if(!Under(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),p)&&!Under(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),p))throw new Exception();}
 static bool Trusted(string sid){return sid==User.Value||sid=="S-1-5-18"||sid=="S-1-5-32-544";}
 static void CheckAcl(string p,bool directory,bool privateData){
  Canonical(p);
  FileSystemSecurity acl=directory?(FileSystemSecurity)Directory.GetAccessControl(p):File.GetAccessControl(p);
  if(privateData&&acl.GetOwner(typeof(SecurityIdentifier)).Value!=User.Value)throw new Exception();
  bool userAccess=false;
  foreach(FileSystemAccessRule rule in acl.GetAccessRules(true,true,typeof(SecurityIdentifier))){
   string sid=rule.IdentityReference.Value;
   if(rule.AccessControlType!=AccessControlType.Allow||(rule.PropagationFlags&PropagationFlags.InheritOnly)!=0)continue;
   if(sid==User.Value&&(rule.FileSystemRights&FileSystemRights.ReadData)!=0)userAccess=true;
   var writes=FileSystemRights.WriteData|FileSystemRights.AppendData|FileSystemRights.WriteAttributes|FileSystemRights.WriteExtendedAttributes|FileSystemRights.DeleteSubdirectoriesAndFiles|FileSystemRights.Delete|FileSystemRights.ChangePermissions|FileSystemRights.TakeOwnership;
   if(!Trusted(sid)&&(privateData||(rule.FileSystemRights&writes)!=0))throw new Exception();
  }
  if(privateData&&!userAccess)throw new Exception();
 }
 static void DirectoryOperation(string p,bool create){
  Canonical(p);PrivateArea(p);
  if(!Directory.Exists(p)&&create){
   // Only create one requested directory. Never rewrite ACLs of existing data.
   string parent=Path.GetDirectoryName(p);if(!Directory.Exists(parent))throw new Exception();
   CheckAcl(parent,true,false);
   var acl=new DirectorySecurity();acl.SetOwner(User);acl.SetAccessRuleProtection(true,false);
   acl.AddAccessRule(new FileSystemAccessRule(User,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
   acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier("S-1-5-18"),FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
   Directory.CreateDirectory(p,acl);
  }
  CheckAcl(p,true,true);
 }
 // Create suspended, attach to a kill-on-close job, then resume: no launch/attach race.
 [StructLayout(LayoutKind.Sequential)] struct SystemInfo {public ushort architecture,reserved;public uint pageSize;public IntPtr minimum,maximum;public UIntPtr mask;public uint processors,type,granularity;public ushort level,revision;}
 [DllImport("kernel32.dll")] static extern void GetNativeSystemInfo(out SystemInfo info);
 [StructLayout(LayoutKind.Sequential)] struct BasicLimits {public long perProcess,perJob;public uint flags;public UIntPtr min,max;public uint active;public UIntPtr affinity;public uint priority,scheduling;}
 [StructLayout(LayoutKind.Sequential)] struct Io {public ulong r,w,o,rb,wb,ob;}
 [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {public BasicLimits basic;public Io io;public UIntPtr processMemory,jobMemory,peakProcess,peakJob;}
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct Startup {public int cb;public string reserved,desktop,title;public uint x,y,xsize,ysize,xchars,ychars,fill,flags;public ushort show,reserved2;public IntPtr reservedPtr,input,output,error;}
 [StructLayout(LayoutKind.Sequential)] struct ProcessInfo {public IntPtr process,thread;public uint pid,tid;}
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct ProcessEntry {public uint size,usage,pid;public UIntPtr heap;public uint module,threads,parent;public int priority;public uint flags;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)] public string exe;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attrs,string name);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int info,ref ExtendedLimits limits,uint size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateJobObject(IntPtr job,uint code);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string binary,StringBuilder command,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr environment,string cwd,ref Startup startup,out ProcessInfo process);
 [DllImport("kernel32.dll")] static extern uint ResumeThread(IntPtr thread);
 [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process,uint code);
 [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr process,uint ms);
 [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
 [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint rights,bool inherit,int pid);
 [DllImport("kernel32.dll")] static extern IntPtr CreateToolhelp32Snapshot(uint flags,uint pid);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool Process32First(IntPtr snapshot,ref ProcessEntry entry);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool Process32Next(IntPtr snapshot,ref ProcessEntry entry);
 static int ParentId(){IntPtr snap=CreateToolhelp32Snapshot(2,0);if(snap==new IntPtr(-1))throw new Exception();try{var e=new ProcessEntry();e.size=(uint)Marshal.SizeOf(e);bool ok=Process32First(snap,ref e);while(ok){if(e.pid==Process.GetCurrentProcess().Id)return (int)e.parent;ok=Process32Next(snap,ref e);}throw new Exception();}finally{CloseHandle(snap);}}
 static IntPtr Job(){var job=CreateJobObject(IntPtr.Zero,null);if(job==IntPtr.Zero)throw new Exception();var limits=new ExtendedLimits();limits.basic.flags=0x2000;if(!SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(limits))){CloseHandle(job);throw new Exception();}return job;}
 static string Quote(string s){if(s.IndexOf('\0')>=0||s.IndexOf('\n')>=0||s.IndexOf('\r')>=0)throw new Exception();var b=new StringBuilder("\"");int slashes=0;foreach(char c in s){if(c=='\\'){slashes++;continue;}if(c=='"'){b.Append('\\',slashes*2+1);b.Append(c);}else{b.Append('\\',slashes);b.Append(c);}slashes=0;}b.Append('\\',slashes*2);b.Append('"');return b.ToString();}
 static int Supervise(Dictionary<string,object> r){
  string binary=Canonical(Text(r,"binary")),cwd=Canonical(Text(r,"cwd"));CheckAcl(binary,false,false);CheckAcl(cwd,true,true);
  var cmd=new StringBuilder(Quote(binary));foreach(object a in (System.Collections.IEnumerable)r["args"])cmd.Append(" "+Quote(Convert.ToString(a)));
  IntPtr job=Job();var si=new Startup();si.cb=Marshal.SizeOf(si);ProcessInfo pi=new ProcessInfo();
  try{
   if(!CreateProcess(binary,cmd,IntPtr.Zero,IntPtr.Zero,false,0x4|0x08000000,IntPtr.Zero,cwd,ref si,out pi))throw new Exception();
   if(!AssignProcessToJobObject(job,pi.process)){TerminateProcess(pi.process,1);throw new Exception();}
   if(ResumeThread(pi.thread)==0xffffffff){TerminateProcess(pi.process,1);throw new Exception();}
   Task.Run(()=>{Console.In.ReadToEnd();TerminateJobObject(job,1);});
   WaitForSingleObject(pi.process,0xffffffff);uint code;GetExitCodeProcess(pi.process,out code);return (int)code;
  }finally{if(pi.thread!=IntPtr.Zero)CloseHandle(pi.thread);if(pi.process!=IntPtr.Zero)CloseHandle(pi.process);CloseHandle(job);}
 }
 static void Guard(int pid){if(pid!=ParentId())throw new Exception();IntPtr job=Job(),parent=OpenProcess(0x101,false,pid);try{if(parent==IntPtr.Zero||!AssignProcessToJobObject(job,parent))throw new Exception();Reply("ready");Console.In.ReadToEnd();}finally{if(parent!=IntPtr.Zero)CloseHandle(parent);CloseHandle(job);}}
 static int Main(string[] args){
  try{
   SystemInfo system;GetNativeSystemInfo(out system);if(system.architecture!=9)throw new Exception();
   if(!Environment.Is64BitProcess||Convert.ToString(Microsoft.Win32.Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion","InstallationType",null))!="Client")throw new Exception();
   int build;if(!Int32.TryParse(Convert.ToString(Microsoft.Win32.Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion","CurrentBuildNumber",null)),out build)||build<22000)throw new Exception();
   Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);
   var r=Json.Deserialize<Dictionary<string,object>>(ReadLine());string op=Text(r,"operation");
   if(args.Length==1&&args[0]=="desktop"&&op=="desktop")return DesktopSupervise(r);
   if(args.Length==1&&args[0]=="supervise"&&op=="supervise")return Supervise(r);
   if(args.Length==1&&args[0]=="guard"&&op=="guard"){Guard(Convert.ToInt32(r["pid"]));return 0;}
   if(args.Length!=0)throw new Exception();
   if(op=="info"){Reply(Canonical(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)));return 0;}
   if(op=="directory"){DirectoryOperation(Text(r,"path"),r.ContainsKey("create")&&Convert.ToBoolean(r["create"]));Reply("");return 0;}
   if(op=="file"||op=="executable"){CheckAcl(Text(r,"path"),false,op=="file");Reply("");return 0;}
   if(op=="protect"||op=="unprotect"){
    Guid device,key;if(!Guid.TryParse(Text(r,"deviceId"),out device)||!Guid.TryParse(Text(r,"keyId"),out key))throw new Exception();
    byte[] value=Convert.FromBase64String(Text(r,"value"));if(value.Length==0||value.Length>16384)throw new Exception();
    byte[] entropy=Encoding.UTF8.GetBytes("social-lead-workbench:v3:"+device.ToString()+":"+key.ToString());
    byte[] result=op=="protect"?ProtectedData.Protect(value,entropy,DataProtectionScope.CurrentUser):ProtectedData.Unprotect(value,entropy,DataProtectionScope.CurrentUser);
    Array.Clear(value,0,value.Length);Reply(Convert.ToBase64String(result));Array.Clear(result,0,result.Length);return 0;
   }
   throw new Exception();
  }catch{Console.Error.WriteLine("WINDOWS_HOST_OPERATION_FAILED");return 1;}
 }
}
