package main
import("os";"github.com/xpzouying/xiaohongshu-mcp/browser")
func desktopOfflineProbe() {
 if os.Getenv("CRM_DESKTOP_OFFLINE_TEST")!="1"{panic("OFFLINE_TEST_NOT_AUTHORIZED")}
 stage:=func(s string){if err:=os.WriteFile("desktop-probe-stage",[]byte(s),0600);err!=nil{panic(err)}}
 stage("starting");b:=browser.NewBrowser(true);defer b.Close();stage("browser-ready");page:=b.NewPage();defer page.Close();stage("page-ready");page.MustNavigate("data:text/html,%3Ch1%3EDesktop%20offline%20test%3C%2Fh1%3E");stage("navigated");page.MustWaitLoad();stage("load-ready");page.MustScreenshot("desktop-offline.png");stage("image-saved")
 if os.Getenv("CRM_DESKTOP_OFFLINE_CREDITS")=="1"{page.MustNavigate("chrome://credits/");page.MustWaitLoad();text:=page.MustEval("() => document.body.textContent").String();if len(text)<10000{panic("CREDITS_INCOMPLETE")};if err:=os.WriteFile("desktop-licenses.txt",[]byte(text),0600);err!=nil{panic(err)};stage("credits-saved")}
}
