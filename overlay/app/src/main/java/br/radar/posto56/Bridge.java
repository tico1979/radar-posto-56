package br.radar.posto56;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Ponte entre a página (JavaScript) e o Android: dados guardados, leitura dos sites e notificações.
 * Os sites são abertos em navegadores invisíveis (WebView), como se fosse o Chrome do celular,
 * porque o ZAP e a OLX recusam (erro 403) pedidos que não vêm de um navegador.
 */
public class Bridge {
    private static final int MAX_LOADERS = 3;
    private static final long PAGE_TIMEOUT = 30_000;

    private final Context ctx;
    private final Runnable onDone;
    private final SharedPreferences prefs;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ConcurrentHashMap<Integer, String> results = new ConcurrentHashMap<>();
    private final AtomicInteger seq = new AtomicInteger();
    private final ArrayDeque<Object[]> queue = new ArrayDeque<>();
    private final ArrayList<WebView> idle = new ArrayList<>();
    private int created = 0;

    Bridge(Context ctx, Runnable onDone) {
        this.ctx = ctx.getApplicationContext();
        this.onDone = onDone;
        this.prefs = this.ctx.getSharedPreferences("radar", Context.MODE_PRIVATE);
    }

    static void setup(WebView web, Context ctx, Runnable onDone) {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        web.addJavascriptInterface(new Bridge(ctx, onDone), "Android");
    }

    @JavascriptInterface
    public String get(String key) {
        return prefs.getString(key, null);
    }

    @JavascriptInterface
    public void set(String key, String json) {
        prefs.edit().putString(key, json).apply();
    }

    @JavascriptInterface
    public int fetchStart(final String url) {
        final int id = seq.incrementAndGet();
        main.post(() -> {
            queue.add(new Object[]{id, url});
            pump();
        });
        return id;
    }

    /** Devolve "código\nHTML" quando terminou, ou null enquanto ainda está carregando. */
    @JavascriptInterface
    public String fetchResult(int id) {
        return results.remove(id);
    }

    @JavascriptInterface
    public void notify(String title, String message) {
        Notifier.show(ctx, title, message);
    }

    @JavascriptInterface
    public void reschedule() {
        Scheduler.schedule(ctx, true);
    }

    @JavascriptInterface
    public void done() {
        if (onDone != null) onDone.run();
    }

    // ---------- navegadores invisíveis ----------

    private void pump() {
        while (!queue.isEmpty()) {
            WebView w;
            if (!idle.isEmpty()) w = idle.remove(idle.size() - 1);
            else if (created < MAX_LOADERS) w = newLoader();
            else return;
            if (w == null) {
                Object[] job = queue.poll();
                results.put((Integer) job[0], "0\nNão consegui abrir o navegador interno");
                continue;
            }
            Object[] job = queue.poll();
            load(w, (Integer) job[0], (String) job[1]);
        }
    }

    private WebView newLoader() {
        try {
            WebView w = new WebView(ctx);
            WebSettings s = w.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setLoadsImagesAutomatically(false);
            s.setBlockNetworkImage(true);
            created++;
            return w;
        } catch (Throwable t) {
            return null;
        }
    }

    private static boolean looksBlocked(String html) {
        String h = html.length() > 4000 ? html.substring(0, 4000) : html;
        return h.contains("Just a moment") || h.contains("challenge-platform") || h.contains("cf-chl")
                || h.contains("px-captcha") || h.contains("_Incapsula_") || h.contains("Access Denied")
                || h.contains("Checking your browser");
    }

    private void load(final WebView w, final int id, final String url) {
        final long start = System.currentTimeMillis();
        final boolean[] finished = {false};
        final boolean[] checking = {false};

        final Runnable[] check = new Runnable[1];
        check[0] = () -> {
            if (finished[0] || checking[0]) return;
            checking[0] = true;
            w.evaluateJavascript("(function(){return document.documentElement ? document.documentElement.outerHTML : ''})()", v -> {
                checking[0] = false;
                if (finished[0]) return;
                String html = decode(v);
                boolean timeUp = System.currentTimeMillis() - start > PAGE_TIMEOUT;
                boolean ready = html.length() > 15000 && !looksBlocked(html);
                if (!ready && !timeUp) {
                    main.postDelayed(check[0], 1500);
                    return;
                }
                finished[0] = true;
                results.put(id, (html.isEmpty() ? "0\nA página não abriu" : (looksBlocked(html) ? "403\n" : "200\n") + html));
                w.stopLoading();
                w.loadUrl("about:blank");
                idle.add(w);
                pump();
            });
        };

        w.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String u) {
                if (u == null || u.startsWith("about:")) return;
                main.postDelayed(check[0], 800);
            }
        });
        w.loadUrl(url);
        main.postDelayed(check[0], 6000);
        main.postDelayed(check[0], PAGE_TIMEOUT + 500);
    }

    private static String decode(String v) {
        if (v == null || v.equals("null")) return "";
        try {
            return new JSONArray("[" + v + "]").getString(0);
        } catch (Exception e) {
            return "";
        }
    }
}
