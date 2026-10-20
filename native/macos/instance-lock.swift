// OS advisory guard only. No process enumeration, signals, keychain or credentials.
import Foundation
import Darwin
func fail(_ code: Int32) -> Never { exit(code) }
guard CommandLine.arguments.count == 2 else { fail(74) }
let path = CommandLine.arguments[1]
let fd = open(path, O_CREAT | O_RDWR | O_NOFOLLOW | O_CLOEXEC, mode_t(0o600))
guard fd >= 0 else { fail(74) }
var info = stat()
guard fstat(fd, &info) == 0, (info.st_mode & S_IFMT) == S_IFREG,
      info.st_uid == getuid(), (info.st_mode & 0o077) == 0, info.st_nlink == 1 else { fail(74) }
guard flock(fd, LOCK_EX | LOCK_NB) == 0 else { fail(errno == EWOULDBLOCK ? 73 : 74) }
// Never unlink this inode; every launcher must lock the same persistent guard.
var entry = stat()
guard lstat(path, &entry) == 0, entry.st_dev == info.st_dev, entry.st_ino == info.st_ino else { fail(74) }
var size = 0
guard sysctlbyname("kern.bootsessionuuid", nil, &size, nil, 0) == 0, size > 1, size < 100 else { fail(74) }
var bytes = [CChar](repeating: 0, count: size)
guard sysctlbyname("kern.bootsessionuuid", &bytes, &size, nil, 0) == 0,
      let boot = UUID(uuidString: String(cString: bytes)) else { fail(74) }
let data = try! JSONSerialization.data(withJSONObject: ["bootId": boot.uuidString.lowercased()])
FileHandle.standardOutput.write(data + Data([10]))
// Parent stdin EOF (including abrupt exit) releases flock. Leftover app processes
// still require reboot evidence before an abandoned operation.lock is replaced.
_ = FileHandle.standardInput.readDataToEndOfFile()
flock(fd, LOCK_UN)
close(fd)
