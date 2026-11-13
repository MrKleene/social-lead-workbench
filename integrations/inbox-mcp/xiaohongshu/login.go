package xiaohongshu

import (
	"context"
	"encoding/json"
	"net/url"
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

// CheckLoginStatusInPlace 只看当前页面的登录态，不做任何导航。
//
// 扫码等待期间必须用它：`CheckLoginStatus` 会重新导航到 explore 首页，
// 把正在等待扫码的登录页整个冲掉，扫码结果就永远回不来。
// 判据是会话 Cookie——它也正是登录成功后要保存的那份凭据。
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

// CurrentUser 当前登录用户的基础信息。
type CurrentUser struct {
	Nickname string `json:"nickname"`
	UserID   string `json:"userId"`
	Avatar   string `json:"avatar"`
}

// CurrentUser 从当前页面的 __INITIAL_STATE__ 读取登录用户信息。
// 需在 CheckLoginStatus 之后调用：复用已加载的 explore 页，不做额外导航。
func (a *LoginAction) CurrentUser(ctx context.Context) (*CurrentUser, error) {
	pp := a.page.Context(ctx).Timeout(10 * time.Second)

	res, err := pp.Eval(`() => {
		const u = window.__INITIAL_STATE__ && window.__INITIAL_STATE__.user;
		const info = u && u.userInfo && u.userInfo.value !== undefined ? u.userInfo.value : (u && u.userInfo);
		if (!info || info.guest) return "";
		// 头像字段在不同版本里叫 avatar / image / avatarUrl，取第一个非空的。
		const avatar = info.avatar || info.image || info.avatarUrl || "";
		return JSON.stringify({nickname: info.nickname, userId: info.userId || info.user_id, avatar: avatar});
	}`)
	if err != nil {
		return nil, errors.Wrap(err, "read current user state failed")
	}

	raw := res.Value.String()
	if raw == "" {
		return nil, errors.New("current user not found in page state")
	}

	var user CurrentUser
	if err := json.Unmarshal([]byte(raw), &user); err != nil {
		return nil, errors.Wrap(err, "unmarshal current user failed")
	}

	user.Avatar = normalizeAvatarURL(user.Avatar)
	return &user, nil
}

// normalizeAvatarURL 只放行 https 绝对地址：协议相对的 //host 补成 https，
// 其余（http、data:、javascript:、相对路径）一律丢弃，交给前端回退到首字。
func normalizeAvatarURL(raw string) string {
	s := strings.TrimSpace(raw)
	if strings.HasPrefix(s, "//") {
		s = "https:" + s
	}
	if len(s) > 2048 || !strings.HasPrefix(s, "https://") {
		return ""
	}
	if _, err := url.Parse(s); err != nil {
		return ""
	}
	return s
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
