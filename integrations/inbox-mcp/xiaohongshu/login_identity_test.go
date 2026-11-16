package xiaohongshu

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
)

// 身份缓存：扫码成功时落盘，状态查询据此直接返回，不用再起浏览器读身份。
// 它是文件契约，跑离线用例即可。
func TestLoginIdentityCache(t *testing.T) {
	dir := t.TempDir()
	if _, ok := LoadLoginIdentity(dir); ok {
		t.Fatal("空目录不应读到身份")
	}

	const sender = "aaaaaaaaaaaaaaaaaaaaaaaa"
	if err := SaveLoginIdentity(dir, &CurrentUser{Nickname: "合成昵称", UserID: sender, Avatar: "https://synthetic.invalid/avatar.png"}); err != nil {
		t.Fatalf("写入身份缓存失败: %v", err)
	}

	user, ok := LoadLoginIdentity(dir)
	if !ok || user.UserID != sender || user.Nickname != "合成昵称" {
		t.Fatalf("身份不符: %+v ok=%v", user, ok)
	}

	info, err := os.Stat(filepath.Join(dir, loginIdentityFile))
	if err != nil {
		t.Fatalf("身份缓存文件不存在: %v", err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("身份缓存必须是 0600，实际 %v", info.Mode().Perm())
	}

	// 没有 userId 就不是身份，宁可不写
	if err := SaveLoginIdentity(dir, &CurrentUser{Nickname: "只有昵称"}); err == nil {
		t.Fatal("缺 userId 应拒绝写入")
	}
}

// 本地合成页面，不执行任何真实平台请求。
//
// 固定这条约束：账号身份只能从已经加载出登录态的页面上读。扫码轮询用的是新开浏览器
// 上的空白页，一旦跳过"先加载页面"这一步，扫码成功也会被判成身份不对，账号加不进来。
func TestLoginIdentityRequiresLoadedPage(t *testing.T) {
	binary := os.Getenv("CRM_OFFLINE_CHROMIUM")
	if binary == "" {
		t.Skip("explicit reviewed local Chromium required")
	}
	const sender = "aaaaaaaaaaaaaaaaaaaaaaaa"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(`<!doctype html><meta charset="utf-8"><script>
 setTimeout(()=>{window.__INITIAL_STATE__={user:{userInfo:{value:{userId:'` + sender + `',nickname:'合成昵称',avatar:'https://synthetic.invalid/avatar.png'}}}}},300);
 </script>`))
	}))
	defer server.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	launch := launcher.New().Bin(binary).UserDataDir(t.TempDir()).Headless(true).Leakless(false).Set("no-sandbox").Set("disable-gpu").Set("disable-background-networking").Set("disable-component-update").Set("no-first-run")
	control, err := launch.Context(ctx).Launch()
	if err != nil {
		t.Fatal(err)
	}
	defer launch.Cleanup()
	browser := rod.New().ControlURL(control).Context(ctx)
	if err := browser.Connect(); err != nil {
		t.Fatal(err)
	}
	defer browser.Close()

	t.Run("空白页读不到身份", func(t *testing.T) {
		page := browser.MustPage()
		defer page.Close()
		if user, err := NewLogin(page).CurrentUser(ctx); err == nil {
			t.Fatalf("空白页不应读到账号身份: %+v", user)
		}
	})

	t.Run("加载出登录态之后才读得到身份", func(t *testing.T) {
		page := browser.MustPage()
		defer page.Close()
		action := NewLogin(page)
		if err := action.loadLoggedInPage(ctx, server.URL); err != nil {
			t.Fatalf("加载登录态页面失败: %v", err)
		}
		user, err := action.CurrentUser(ctx)
		if err != nil {
			t.Fatalf("读取身份失败: %v", err)
		}
		if user.UserID != sender || user.Nickname != "合成昵称" {
			t.Fatalf("身份不符: %+v", user)
		}
		if user.Avatar != "https://synthetic.invalid/avatar.png" {
			t.Fatalf("头像应被读出并保留 https 地址: %+v", user)
		}
	})
}

// 头像比昵称晚到：登录态刚出现时 userInfo 里没有头像，几百毫秒后才补上。
// 固定这条约束：CurrentUser 必须等一小会儿再返回，否则账号中心永远是昵称首字。
func TestCurrentUserWaitsForLateAvatar(t *testing.T) {
	binary := os.Getenv("CRM_OFFLINE_CHROMIUM")
	if binary == "" {
		t.Skip("explicit reviewed local Chromium required")
	}
	const sender = "bbbbbbbbbbbbbbbbbbbbbbbb"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(`<!doctype html><meta charset="utf-8"><script>
 setTimeout(()=>{window.__INITIAL_STATE__={user:{userInfo:{value:{userId:'` + sender + `',nickname:'合成昵称'}}}}},100);
 setTimeout(()=>{window.__INITIAL_STATE__.user.userInfo.value.image='https://synthetic.invalid/late-avatar.png'},700);
 </script>`))
	}))
	defer server.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	launch := launcher.New().Bin(binary).UserDataDir(t.TempDir()).Headless(true).Leakless(false).Set("no-sandbox").Set("disable-gpu").Set("disable-background-networking").Set("disable-component-update").Set("no-first-run")
	control, err := launch.Context(ctx).Launch()
	if err != nil {
		t.Fatal(err)
	}
	defer launch.Cleanup()
	browser := rod.New().ControlURL(control).Context(ctx)
	if err := browser.Connect(); err != nil {
		t.Fatal(err)
	}
	defer browser.Close()

	page := browser.MustPage()
	defer page.Close()
	action := NewLogin(page)
	if err := action.loadLoggedInPage(ctx, server.URL); err != nil {
		t.Fatalf("加载登录态页面失败: %v", err)
	}
	user, err := action.CurrentUser(ctx)
	if err != nil {
		t.Fatalf("读取身份失败: %v", err)
	}
	if user.Avatar != "https://synthetic.invalid/late-avatar.png" {
		t.Fatalf("应等到迟到的头像（image 字段）: %+v", user)
	}
}

// 二维码页和首页都没有头像、只有自己的主页有：ReadIdentity 必须一路导航过去拿到，
// 否则缓存里留下空头像，之后状态查询命中缓存，账号中心就永远是昵称首字。
func TestReadIdentityNavigatesWhenAvatarMissing(t *testing.T) {
	binary := os.Getenv("CRM_OFFLINE_CHROMIUM")
	if binary == "" {
		t.Skip("explicit reviewed local Chromium required")
	}
	const sender = "cccccccccccccccccccccccc"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		// /me 模拟个人主页：userInfo 是 guest 视角（主页上很常见），
		// 头像和昵称只在 userPageData.basicInfo 里。
		state := `{user:{userInfo:{value:{userId:'` + sender + `',nickname:'合成昵称'}}}}`
		if r.URL.Path == "/me" {
			state = `{user:{userInfo:{value:{guest:true}},userPageData:{value:{basicInfo:{nickname:'合成昵称',images:'http://synthetic.invalid/me.png'}}}}}`
		}
		w.Write([]byte(`<!doctype html><meta charset="utf-8"><script>
 setTimeout(()=>{window.__INITIAL_STATE__=` + state + `},50);
 </script>`))
	}))
	defer server.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	launch := launcher.New().Bin(binary).UserDataDir(t.TempDir()).Headless(true).Leakless(false).Set("no-sandbox").Set("disable-gpu").Set("disable-background-networking").Set("disable-component-update").Set("no-first-run")
	control, err := launch.Context(ctx).Launch()
	if err != nil {
		t.Fatal(err)
	}
	defer launch.Cleanup()
	browser := rod.New().ControlURL(control).Context(ctx)
	if err := browser.Connect(); err != nil {
		t.Fatal(err)
	}
	defer browser.Close()

	page := browser.MustPage()
	defer page.Close()
	action := NewLogin(page)
	if err := action.loadLoggedInPage(ctx, server.URL+"/qr"); err != nil {
		t.Fatalf("加载二维码页失败: %v", err)
	}
	if user, err := action.CurrentUser(ctx); err != nil || user.Avatar != "" {
		t.Fatalf("二维码页不应有头像: %+v err=%v", user, err)
	}
	user, err := action.readIdentity(ctx, 2*time.Second, server.URL+"/explore", func(string) string { return server.URL + "/me" })
	if err != nil {
		t.Fatalf("读取身份失败: %v", err)
	}
	// images 给的是 http：必须升级成 https 才收，否则渲染层加载不了。
	if user.Avatar != "https://synthetic.invalid/me.png" {
		t.Fatalf("应导航到个人主页从 basicInfo.images 拿到头像（http 升级为 https）: %+v", user)
	}
}


// 头像地址只认 https：协议相对补协议，站内静态资源补绝对地址，其余一律丢弃。
func TestNormalizeAvatarURL(t *testing.T) {
	cases := map[string]string{
		"https://sns-avatar-qc.xhscdn.com/avatar/x.jpg": "https://sns-avatar-qc.xhscdn.com/avatar/x.jpg",
		"//sns-avatar-qc.xhscdn.com/avatar/x.jpg":       "https://sns-avatar-qc.xhscdn.com/avatar/x.jpg",
		"/fe-static/default-avatar.png":                 "https://www.xiaohongshu.com/fe-static/default-avatar.png",
		"http://sns-avatar-qc.xhscdn.com/avatar/x.jpg":  "",
		"javascript:alert(1)":                           "",
		"data:image/png;base64,AAAA":                    "",
		"":                                              "",
	}
	for in, want := range cases {
		if got := normalizeAvatarURL(in); got != want {
			t.Fatalf("%q 归一化后是 %q，期望 %q", in, got, want)
		}
	}
}
