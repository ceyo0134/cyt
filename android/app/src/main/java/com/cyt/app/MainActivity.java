package com.cyt.app;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;

import org.mozilla.geckoview.AllowOrDeny;
import org.mozilla.geckoview.GeckoResult;
import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoSession;
import org.mozilla.geckoview.GeckoView;

import java.util.Locale;

/** cyt: YouTube-locked GeckoView shell with the bundled cyt extension (GPL-3.0). */
public class MainActivity extends Activity {
    private static GeckoRuntime sRuntime;
    private GeckoSession session;
    private boolean canGoBack = false;

    private static final String HOME = "https://m.youtube.com/";
    private static final String[] ALLOWED = {
        "youtube.com", "youtu.be", "google.com", "googleusercontent.com",
        "gstatic.com", "ytimg.com", "youtube-nocookie.com"
    };

    static boolean allowed(String uri) {
        if (uri == null) return false;
        if (uri.equals("about:blank")) return true;
        Uri u = Uri.parse(uri);
        if (!"https".equals(u.getScheme())) return false;
        String h = u.getHost();
        if (h == null) return false;
        h = h.toLowerCase(Locale.ROOT);
        for (String d : ALLOWED) {
            if (h.equals(d) || h.endsWith("." + d)) return true;
        }
        return false;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        GeckoView view = new GeckoView(this);
        setContentView(view);

        if (sRuntime == null) sRuntime = GeckoRuntime.create(getApplicationContext());

        session = new GeckoSession();
        session.setNavigationDelegate(new GeckoSession.NavigationDelegate() {
            @Override
            public GeckoResult<AllowOrDeny> onLoadRequest(GeckoSession s, GeckoSession.NavigationDelegate.LoadRequest request) {
                return GeckoResult.fromValue(allowed(request.uri) ? AllowOrDeny.ALLOW : AllowOrDeny.DENY);
            }

            @Override
            public GeckoResult<GeckoSession> onNewSession(GeckoSession s, String uri) {
                if (allowed(uri)) session.loadUri(uri);
                return GeckoResult.fromValue(null);
            }

            @Override
            public void onCanGoBack(GeckoSession s, boolean value) {
                canGoBack = value;
            }
        });
        session.setContentDelegate(new GeckoSession.ContentDelegate() {
            @Override
            public void onFullScreen(GeckoSession s, boolean fullScreen) {
                getWindow().getDecorView().setSystemUiVisibility(fullScreen
                    ? View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    : View.SYSTEM_UI_FLAG_VISIBLE);
            }
        });
        session.open(sRuntime);
        view.setSession(session);

        // Install the bundled extension first so its content scripts run on the first page load.
        final Runnable load = () -> session.loadUri(HOME);
        sRuntime.getWebExtensionController()
            .installBuiltIn("resource://android/assets/cyt/")
            .accept(ext -> load.run(), err -> load.run());
    }

    @Override
    public void onBackPressed() {
        if (canGoBack && session != null) session.goBack();
        else super.onBackPressed();
    }
}
