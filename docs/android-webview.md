# Android WebView 遥控器接入

网页已接管方向、确认、返回键，并在加载/回到前台时恢复 Canvas 焦点。
若宿主未将硬件事件交给网页，需要在 Android Activity 接入下面的转发。
仓库不含 Android 工程，此代码需放入已有宿主，webView 替换为实际实例。

```kotlin
webView.settings.javaScriptEnabled = true
webView.isFocusable = true
webView.isFocusableInTouchMode = true
webView.requestFocus()

// Activity 内；仅在游戏 WebView 正显示时走此分支。
override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    val supported = event.keyCode in setOf(19, 20, 21, 22, 23, 66, 62, 4, 111, 96, 97, 108, 82)
    if (webView.hasFocus() && supported &&
        (event.action == KeyEvent.ACTION_DOWN || event.action == KeyEvent.ACTION_UP)) {
        webView.evaluateJavascript(
            "window.WxStackRemote && window.WxStackRemote.dispatchKey(" +
                "${event.keyCode},${event.action},${event.repeatCount})", null)
        return true // 已转发：不要再次交给 WebView，避免一次按键触发两次。
    }
    return super.dispatchKeyEvent(event)
}
```

系统返回若由 AndroidX OnBackPressedDispatcher 接管，在现有返回回调中调用
`webView.evaluateJavascript("window.WxStackRemote && window.WxStackRemote.dispatchKey(4,0,0)", null)`。
只在游戏页启用该回调，其他页面保留宿主原有导航。不要同时转发同一次返回事件。

昵称编辑时，网页会让普通文本按键和输入法直接进入原生输入框。宿主可通过
`window.WxStackRemote.isTextEditing()` 查询编辑状态，并在自己的输入路由中对文本键、空格、退格、输入法组合事件放行给 WebView，不能把上面的全局拦截无条件用于文字输入。
已经通过桥接转发的遥控器确认键会结束文字输入并选中“保存”，方向键切换输入/保存/取消，返回键取消。上述桥接只支持遥控导航，不代替系统输入法；应在宿主实机复测软键盘和外接键盘。

实机验证：首页上下选项/确认、商店选中与返回、设置开关、游戏确认落块/返回暂停、
结算重开/返回；长按确认不能连续落块，切后台再回来仍可操作，音量键保留系统功能。

参考：https://developer.android.com/reference/android/webkit/WebView
