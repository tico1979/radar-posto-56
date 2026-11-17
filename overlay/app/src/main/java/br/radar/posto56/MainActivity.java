package br.radar.posto56;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.widget.FrameLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.PrintWriter;
import java.io.StringWriter;

public class MainActivity extends Activity {
    private WebView web;
    private boolean loaded = false;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        // Se o app fechou sozinho na última vez, mostra o erro (uma vez) para enviar ao Claude.
        SharedPreferences crash = getSharedPreferences("crash", Context.MODE_PRIVATE);
        String last = crash.getString("last", null);
        if (last != null) {
            crash.edit().remove("last").commit();
            showText("O app fechou com este erro na última vez. Tire um print e mande para o Claude.\n"
                    + "Feche e abra o app de novo para tentar outra vez.\n\n" + last);
            return;
        }

        try {
            Notifier.ensureChannel(this);
            if (Build.VERSION.SDK_INT >= 33
                    && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
            }
        } catch (Throwable t) {
            // notificações são opcionais
        }

        try {
            web = new WebView(this);
        } catch (Throwable t) {
            showText("Não consegui abrir o navegador interno do Android (WebView). "
                    + "Atualize o app \"Android System WebView\" e o Chrome na Play Store e tente de novo.\n\n" + stack(t));
            return;
        }
        FrameLayout root = new FrameLayout(this);
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        Bridge.host = root;
        Bridge.setup(web, this, null);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("http")) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl()));
                    } catch (Throwable ignored) {
                    }
                    return true;
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                loaded = true;
            }
        });
        web.loadUrl("file:///android_asset/radar.html");

        try {
            Scheduler.schedule(this, false);
        } catch (Throwable t) {
            // a busca automática fica desligada, mas o app funciona
        }
    }

    private void showText(String text) {
        TextView tv = new TextView(this);
        tv.setText(text);
        tv.setTextIsSelectable(true);
        tv.setTextColor(Color.BLACK);
        tv.setBackgroundColor(Color.WHITE);
        tv.setTextSize(13);
        int p = (int) (16 * getResources().getDisplayMetrics().density);
        tv.setPadding(p, p * 3, p, p);
        ScrollView sv = new ScrollView(this);
        sv.setBackgroundColor(Color.WHITE);
        sv.addView(tv);
        setContentView(sv);
    }

    private static String stack(Throwable t) {
        StringWriter sw = new StringWriter();
        t.printStackTrace(new PrintWriter(sw));
        return sw.toString();
    }

    @Override
    protected void onDestroy() {
        if (Bridge.host != null && Bridge.host.getContext() == this) Bridge.host = null;
        super.onDestroy();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null && loaded) web.evaluateJavascript("typeof load === 'function' && load()", null);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
