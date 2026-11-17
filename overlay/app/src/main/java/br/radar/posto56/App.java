package br.radar.posto56;

import android.app.Application;
import android.content.Context;

import java.io.PrintWriter;
import java.io.StringWriter;

/** Guarda o erro se o app fechar sozinho, para mostrar na próxima abertura. */
public class App extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try {
                StringWriter sw = new StringWriter();
                error.printStackTrace(new PrintWriter(sw));
                getSharedPreferences("crash", Context.MODE_PRIVATE).edit()
                        .putString("last", sw.toString()).commit();
            } catch (Throwable ignored) {
            }
            if (previous != null) previous.uncaughtException(thread, error);
        });
    }
}
