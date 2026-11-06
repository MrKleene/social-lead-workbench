package browser
import("fmt";"os";"path/filepath";"runtime")
// The host verifies the complete packaged browser manifest. Never use a user's
// cache, download a browser, or fall back to a system browser in desktop mode.
func desktopBrowser() (string,error){
 p:=os.Getenv("CRM_DESKTOP_BROWSER");if !filepath.IsAbs(p){return "",fmt.Errorf("PACKAGED_BROWSER_REQUIRED")};s,e:=os.Lstat(p);if e!=nil||!s.Mode().IsRegular(){return "",fmt.Errorf("PACKAGED_BROWSER_REQUIRED")}
 if runtime.GOOS=="darwin"&&runtime.GOARCH=="arm64"&&filepath.Base(p)=="Chromium" {return p,nil}
 if runtime.GOOS=="windows"&&runtime.GOARCH=="amd64"&&filepath.Base(p)=="chrome.exe" {return p,nil}
 return "",fmt.Errorf("PACKAGED_BROWSER_PLATFORM_UNSUPPORTED")
}
