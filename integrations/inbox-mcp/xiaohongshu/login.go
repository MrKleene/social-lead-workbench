package xiaohongshu

import (
	"context"
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/go-rod/rod"
	"github.com/pkg/errors"
)

type LoginAction struct {
	page *rod.Page
}

func NewLogin(page *rod.Page) *LoginAction {
	return &LoginAction{page: page}
}

func (a *LoginAction) CheckLoginStatus(ctx context.Context) (bool, error) {
	// 加超时保护：只是查登录态的快速检查，不应无限挂（登录扫码的等待在 Login/WaitForLogin 里）
	pp := a.page.Context(ctx).Timeout(30 * time.Second)
	pp.MustNavigate("https://www.xiaohongshu.com/explore").MustWaitLoad()

	time.Sleep(1 * time.Second)

	exists, _, err := pp.Has(`.main-container .user .link-wrapper .channel`)
	if err != nil {
		return false, errors.Wrap(err, "check login status failed")
	}

	if !exists {
		return false, errors.Wrap(err, "login status element not found")
	}

	return true, nil
}

// CheckLoginStatusInPlace 只看本次浏览器的 Cookie 判登录态，不做任何导航。
//
// 扫码等待期间用它：前端每 2 秒轮询一次，判"扫上了没有"不必每次都加载整页。
// 判据是会话 Cookie——它也正是登录成功后要保存的那份凭据，口径一致。
func (a *LoginAction) CheckLoginStatusInPlace(ctx context.Context) (bool, error) {
	pp := a.page.Context(ctx).Timeout(10 * time.Second)
	cks, err := pp.Browser().GetCookies()
	if err != nil {
		return false, errors.Wrap(err, "read cookies failed")
	}
	for _, c := range cks {
		if c.Name == "web_session" && strings.TrimSpace(c.Value) != "" {
			return true, nil
		}
	}
	return false, nil
}

// loggedInIdentityProbe 判断页面状态里是否已经有登录用户身份。
//
// `__INITIAL_STATE__` 由首屏脚本注入，导航完成时可能还只是空壳；游客态也不算数。
const loggedInIdentityProbe = `() => {
	const s = window.__INITIAL_STATE__;
	const u = s && s.user;
	const info = u && u.userInfo && u.userInfo.value !== undefined ? u.userInfo.value : (u && u.userInfo);
	return !!(info && !info.guest && (info.userId || info.user_id));
}`

// exploreURL 登录态首页：身份信息随首屏脚本一起注入到这一页的 __INITIAL_STATE__。
const exploreURL = "https://www.xiaohongshu.com/explore"

// senderID 平台用户 id：24 位小写十六进制。拼进 URL 前必须校验。
var senderID = regexp.MustCompile(`^[a-f0-9]{24}$`)

// profileURL 自己的主页：userPageData.basicInfo.images 才是头像（含平台默认头像）。
func profileURL(userID string) string {
	return "https://www.xiaohongshu.com/user/profile/" + userID
}

// LoadLoggedInPage 加载一次登录态首页，让 `CurrentUser` 有页面状态可读。
//
// 扫码轮询的每次请求都是自己新开的浏览器（Cookie 从会话文件装载）配一张空白页，
// 空白页上没有 `__INITIAL_STATE__`，直接读身份只能读到空。这一页与正在等待扫码的
// 二维码页既不共享浏览器进程，也不共享标签页，所以这里的导航不会把二维码冲掉；
// 只有在 Cookie 已经说明登录成功时才补这一次加载。
func (a *LoginAction) LoadLoggedInPage(ctx context.Context) error {
	return a.loadLoggedInPage(ctx, exploreURL)
}

func (a *LoginAction) loadLoggedInPage(ctx context.Context, target string) error {
	pp := a.page.Context(ctx).Timeout(30 * time.Second)
	if err := pp.Navigate(target); err != nil {
		return errors.Wrap(err, "load logged-in page failed")
	}
	if err := pp.WaitLoad(); err != nil {
		return errors.Wrap(err, "wait logged-in page load failed")
	}
	deadline := time.Now().Add(15 * time.Second)
	for {
		res, err := pp.Eval(loggedInIdentityProbe)
		if err == nil && res.Value.Bool() {
			return nil
		}
		if time.Now().After(deadline) {
			return errors.New("logged-in identity not found in page state")
		}
		time.Sleep(300 * time.Millisecond)
	}
}

// loadPage 只导航 + 等加载，不要求页面上出现登录身份。
// 个人主页的 userInfo 可能是 guest 视角（没有 userId），用 loadLoggedInPage 会在那里
// 空等 15 秒然后判定失败——而那一页恰恰是头像唯一存在的地方。
func (a *LoginAction) loadPage(ctx context.Context, target string) error {
	pp := a.page.Context(ctx).Timeout(30 * time.Second)
	if err := pp.Navigate(target); err != nil {
		return errors.Wrap(err, "load page failed")
	}
	if err := pp.WaitLoad(); err != nil {
		return errors.Wrap(err, "wait page load failed")
	}
	return nil
}

// CurrentUser 当前登录用户的基础信息。
type CurrentUser struct {
	Nickname string `json:"nickname"`
	UserID   string `json:"userId"`
	Avatar   string `json:"avatar"`
}

// loginUserProbe 读当前登录用户。
//
// 头像在不同版本里落在不同字段（avatar / image / avatarUrl / images[0]…），
// 也见过 avatar 本身是 `{url}` 的形态，所以逐个候选取第一个非空的字符串。
const loginUserProbe = `() => {
 const u = window.__INITIAL_STATE__ && window.__INITIAL_STATE__.user;
 const unwrap = v => (v && v.value !== undefined ? v.value : (v && v._rawValue !== undefined ? v._rawValue : v));
 const text = v => (typeof v === 'string' && v.trim() !== '' ? v.trim() : '');
 // 只认能直接用的绝对地址：https 原样，协议相对补 https，其余（http/data/blob/相对）跳过，
 // 让后面的候选继续顶上来。之前用 || 取"第一个非空"，一旦第一个是 http 就被整体丢弃。
 const usable = v => {
  const s = text(v);
  if (!s) return '';
  if (s.startsWith('https://')) return s;
  // 平台有时给 http 的同源 CDN 地址：升级成 https，不换主机。
  if (s.startsWith('http://')) return 'https://' + s.slice(7);
  if (s.startsWith('//')) return 'https:' + s;
  return '';
 };
 const pick = (...vals) => { for (const v of vals) { const s = usable(v); if (s) return s; } return ''; };
 const info = unwrap(u && u.userInfo) || {};
 // 个人主页上的资料在 user.userPageData.basicInfo 里，头像字段是 images / imageb。
 // 注意：主页的 userInfo 可能是 guest 视角，所以不能因为 guest 就提前返回。
 const pageData = unwrap(u && u.userPageData) || {};
 const basic = unwrap(pageData.basicInfo) || {};
 // 个人主页的 URL 本身就带 userId：主页上 userInfo 常常没有它。
 const urlUid = (location.pathname.match(/^\/user\/profile\/([a-f0-9]{24})$/) || [])[1] || '';
 const uid = info.userId || info.user_id || urlUid;
 const nickname = info.nickname || basic.nickname || '';
 const imgSrc = img => {
  const raw = img.currentSrc || img.src || img.getAttribute('data-src') || '';
  return usable(raw);
 };
 // 页面上指向自己主页的那条链接里的图片，是平台实际渲染给本人看的头像
 // （包括平台默认头像）。状态里没有头像字段时用它兜底。
 const ownAvatar = () => {
  if (!uid) return '';
  for (const a of document.querySelectorAll('a[href*="/user/profile/"]')) {
   try {
    const link = new URL(a.getAttribute('href'), location.origin);
    if (link.origin !== 'https://www.xiaohongshu.com' || link.pathname !== '/user/profile/' + uid) continue;
    const img = a.querySelector('img');
    const src = img ? imgSrc(img) : '';
    if (src) return src;
   } catch (e) {}
  }
  return '';
 };
 // 已经在个人主页上：页面上第一张可用的头像图就是本人的（默认头像也是这张）。
 const profileAvatar = () => {
  if (!/^\/user\/profile\/[a-f0-9]{24}$/.test(location.pathname)) return '';
  for (const img of document.querySelectorAll('img')) {
   const src = imgSrc(img);
   if (src && src.includes('/avatar/')) return src;
  }
  return '';
 };
 const avatar = pick(
  info.avatar, info.image, info.avatarUrl, info.avatar_url, info.userAvatar,
  info.avatar && info.avatar.url, info.images && info.images[0], info.images, info.imageb,
  basic.images, basic.imageb
 ) || ownAvatar() || profileAvatar();
 if (!uid && !nickname) return "";
 return JSON.stringify({nickname: nickname, userId: uid, avatar: avatar});
}`

// AvatarDiagnostic 头像读不到时的现场：只返回键名、计数、路径和候选值的类型，不含个人数据。
func (a *LoginAction) AvatarDiagnostic(ctx context.Context) string {
	pp := a.page.Context(ctx).Timeout(5 * time.Second)
	res, err := pp.Eval(`() => {
		const u = window.__INITIAL_STATE__ && window.__INITIAL_STATE__.user;
		const unwrap = v => (v && v.value !== undefined ? v.value : (v && v._rawValue !== undefined ? v._rawValue : v));
		const keys = o => (o && typeof o === 'object' ? Object.keys(o).slice(0, 12).join(',') : '-');
		const shape = v => {
			if (v === undefined || v === null) return 'absent';
			if (typeof v !== 'string') return Array.isArray(v) ? 'array' : typeof v;
			if (!v) return 'empty';
			if (v.startsWith('https://')) return 'https';
			if (v.startsWith('http://')) return 'http';
			if (v.startsWith('//')) return 'proto-relative';
			if (v.startsWith('data:')) return 'data';
			if (v.startsWith('blob:')) return 'blob';
			return 'other';
		};
		const info = unwrap(u && u.userInfo);
		const pageData = unwrap(u && u.userPageData);
		const basic = unwrap(pageData && pageData.basicInfo);
		const imgs = Array.from(document.querySelectorAll('img'));
		const avatarImgs = imgs.filter(i => {
			const s = i.currentSrc || i.src || i.getAttribute('data-src') || '';
			return typeof s === 'string' && s.includes('/avatar/');
		});
		return JSON.stringify({
			path: location.pathname,
			user: keys(u),
			userInfo: info ? (info.guest ? 'guest' : keys(info)) : '-',
			userPageData: keys(pageData),
			basicInfo: keys(basic),
			shapes: {
				userInfoImages: shape(info && info.images),
				userInfoImageb: shape(info && info.imageb),
				basicImages: shape(basic && basic.images),
				basicImageb: shape(basic && basic.imageb),
				firstAvatarImg: shape((avatarImgs[0] && (avatarImgs[0].currentSrc || avatarImgs[0].src)) || '')
			},
			imgs: imgs.length,
			avatarImgs: avatarImgs.length
		});
	}`)
	if err != nil {
		return "diagnostic-unavailable"
	}
	return res.Value.String()
}

// CurrentUser 从当前页面的 __INITIAL_STATE__ 读取登录用户信息。
// 需在页面已经加载出登录态之后调用（`LoadLoggedInPage` 或 `CheckLoginStatus`），
// 空白页上读不到任何用户信息。
//
// 头像比昵称晚到：登录态刚出现时 userInfo 里往往还没有头像字段，所以这里在 2 秒内
// 反复读，拿到头像就返回；超时则带着已读到的昵称与 userId 返回，头像留空。
func (a *LoginAction) CurrentUser(ctx context.Context) (*CurrentUser, error) {
	pp := a.page.Context(ctx).Timeout(10 * time.Second)
	deadline := time.Now().Add(2 * time.Second)
	for {
		res, err := pp.Eval(loginUserProbe)
		if err != nil {
			return nil, errors.Wrap(err, "read current user state failed")
		}
		if raw := res.Value.String(); raw != "" {
			var user CurrentUser
			if err := json.Unmarshal([]byte(raw), &user); err != nil {
				return nil, errors.Wrap(err, "unmarshal current user failed")
			}
			user.Avatar = normalizeAvatarURL(user.Avatar)
			if user.Avatar != "" || time.Now().After(deadline) {
				return &user, nil
			}
		} else if time.Now().After(deadline) {
			return nil, errors.New("current user not found in page state")
		}
		time.Sleep(200 * time.Millisecond)
	}
}

// normalizeAvatarURL 只放行 https 绝对地址：协议相对的 //host 补成 https，
// 站内静态资源（平台默认头像就是 /fe-static/... 这种）补成绝对地址；
// 其余（http、data:、javascript:、其它相对路径）一律丢弃，交给前端回退到首字。
func normalizeAvatarURL(raw string) string {
	s := strings.TrimSpace(raw)
	if strings.HasPrefix(s, "//") {
		s = "https:" + s
	}
	if strings.HasPrefix(s, "/") {
		s = "https://www.xiaohongshu.com" + s
	}
	if len(s) > 2048 || !strings.HasPrefix(s, "https://") {
		return ""
	}
	if _, err := url.Parse(s); err != nil {
		return ""
	}
	return s
}

// WaitForIdentity 在已经登录的页面上等身份出现，不导航。
//
// 扫码成功的那一瞬间页面可能还在刷新（登录弹窗刚关、__INITIAL_STATE__ 还没换成登录态），
// 读一次读不到很正常；这里按短间隔重试，比直接重新加载整页快得多。
func (a *LoginAction) WaitForIdentity(ctx context.Context, timeout time.Duration) (*CurrentUser, error) {
	deadline := time.Now().Add(timeout)
	var lastErr error
	for {
		user, err := a.CurrentUser(ctx)
		if err == nil {
			return user, nil
		}
		lastErr = err
		if time.Now().After(deadline) {
			return nil, errors.Wrap(lastErr, "identity not ready")
		}
		time.Sleep(300 * time.Millisecond)
	}
}

// ReadIdentity 扫码成功后读账号身份。
//
// 二维码页上 userId/nickname 通常已经有了，但**头像字段往往还没有**（甚至整页不渲染
// userInfo 的完整资料）。所以只要当前页读不到身份、或者读到了但没有头像，就加载一次
// 首页再读——首页才是完整的登录态页面，也是页面上"我的头像"真正渲染出来的地方。
// 第二次仍读不到时保留第一次的结果（有昵称就够了，头像可以空着）。
func (a *LoginAction) ReadIdentity(ctx context.Context, wait time.Duration) (*CurrentUser, error) {
	return a.readIdentity(ctx, wait, exploreURL, profileURL)
}

func (a *LoginAction) readIdentity(ctx context.Context, wait time.Duration, explore string, profile func(string) string) (*CurrentUser, error) {
	user, err := a.WaitForIdentity(ctx, wait)
	if err == nil && user.Avatar != "" {
		return user, nil
	}
	// 首页只有昵称和 id，没有头像字段。
	if loadErr := a.loadLoggedInPage(ctx, explore); loadErr == nil {
		if loaded, readErr := a.WaitForIdentity(ctx, wait); readErr == nil && loaded.Avatar != "" {
			return loaded, nil
		}
	}
	// 自己的主页：userPageData.basicInfo.images 一定有头像，包括平台默认头像。
	// 这一页不保证有登录身份（userInfo 可能是 guest），所以只导航、不要求身份门。
	if user != nil && senderID.MatchString(user.UserID) {
		if loadErr := a.loadPage(ctx, profile(user.UserID)); loadErr == nil {
			if loaded, readErr := a.WaitForIdentity(ctx, wait); readErr == nil && loaded.Avatar != "" {
				return loaded, nil
			}
		}
	}
	// 都没读到头像：保留第一次读到的昵称与 id，头像留空，不阻塞登录。
	if user != nil {
		return user, nil
	}
	return nil, err
}

// loginIdentityFile 登录态身份缓存的文件名（放在会话目录里，随会话一起删除）。
const loginIdentityFile = "identity.json"

// SaveLoginIdentity 把已经读到的账号身份写进会话目录。
//
// 扫码成功的那一刻，等待扫码的会话手里就有登录态页面，读身份是现成的；把结果落盘后，
// 状态查询直接命中，不必为了读身份再起一个浏览器（那一步是 5-10 秒的空等）。
// 只写 userId/nickname/avatar，不含任何凭据。
func SaveLoginIdentity(dir string, user *CurrentUser) error {
	if dir == "" || user == nil || strings.TrimSpace(user.UserID) == "" {
		return errors.New("identity required")
	}
	data, err := json.Marshal(CurrentUser{Nickname: user.Nickname, UserID: user.UserID, Avatar: user.Avatar})
	if err != nil {
		return errors.Wrap(err, "marshal identity failed")
	}
	path := filepath.Join(dir, loginIdentityFile)
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return errors.Wrap(err, "write identity failed")
	}
	return os.Chmod(path, 0o600)
}

// LoadLoginIdentity 读取身份缓存；文件缺失、损坏或没有 userId 一律当没有。
func LoadLoginIdentity(dir string) (*CurrentUser, bool) {
	if dir == "" {
		return nil, false
	}
	data, err := os.ReadFile(filepath.Join(dir, loginIdentityFile))
	if err != nil {
		return nil, false
	}
	var user CurrentUser
	if err := json.Unmarshal(data, &user); err != nil || strings.TrimSpace(user.UserID) == "" {
		return nil, false
	}
	user.Avatar = normalizeAvatarURL(user.Avatar)
	return &user, true
}

func (a *LoginAction) Login(ctx context.Context) error {
	pp := a.page.Context(ctx)

	// 导航到小红书首页，这会触发二维码弹窗
	pp.MustNavigate("https://www.xiaohongshu.com/explore").MustWaitLoad()

	time.Sleep(2 * time.Second)

	if exists, _, _ := pp.Has(".main-container .user .link-wrapper .channel"); exists {
		return nil
	}

	pp.MustElement(".main-container .user .link-wrapper .channel")

	return nil
}

func (a *LoginAction) FetchQrcodeImage(ctx context.Context) (string, bool, error) {
	pp := a.page.Context(ctx)

	// 导航到小红书首页，这会触发二维码弹窗
	pp.MustNavigate("https://www.xiaohongshu.com/explore").MustWaitLoad()

	time.Sleep(2 * time.Second)

	if exists, _, _ := pp.Has(".main-container .user .link-wrapper .channel"); exists {
		return "", true, nil
	}

	src, err := pp.MustElement(".login-container .qrcode-img").Attribute("src")
	if err != nil {
		return "", false, errors.Wrap(err, "get qrcode src failed")
	}
	if src == nil || len(*src) == 0 {
		return "", false, errors.New("qrcode src is empty")
	}

	return *src, false, nil
}

func (a *LoginAction) WaitForLogin(ctx context.Context) bool {
	pp := a.page.Context(ctx)
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return false
		case <-ticker.C:
			el, err := pp.Element(".main-container .user .link-wrapper .channel")
			if err == nil && el != nil {
				return true
			}
		}
	}
}
