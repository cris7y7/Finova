package com.novyra.app;

import android.os.Bundle;
import android.os.Environment;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileOutputStream;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;

import android.net.Uri;

import org.json.JSONObject;




public class MainActivity extends BridgeActivity {



    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        manejarOAuthCallback(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        manejarOAuthCallback(getIntent());
        // Actualizar widget
        Intent widgetIntent = new Intent(this, NOVYRAWidget.class);
        widgetIntent.setAction("com.novyra.app.UPDATE_WIDGET");
        sendBroadcast(widgetIntent);

        AppWidgetManager awm = AppWidgetManager.getInstance(this);
        int[] ids = awm.getAppWidgetIds(new ComponentName(this, NOVYRAWidget.class));
        widgetIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
        sendBroadcast(widgetIntent);
    }

    private boolean oauthYaProcesado = false;

    private void manejarOAuthCallback(Intent intent) {
        if (intent == null) return;
        Uri data = intent.getData();
        if (data == null) return;
        if (!"localhost".equals(data.getHost()) || !"/oauth2callback".equals(data.getPath())) return;
        if (oauthYaProcesado) return;

        // El token viene en el fragment (#access_token=...)
        String fragment = data.getFragment();

        if (fragment != null && fragment.contains("access_token")) {
            oauthYaProcesado = true;
            // Limpiar intent para no procesar dos veces
            setIntent(new Intent());
            final String frag = fragment;
            // Esperar a que el WebView esté listo
            getBridge().getWebView().postDelayed(() -> {
                String js = "recibirTokenDrive(" + JSONObject.quote(frag) + ")";
                getBridge().getWebView().evaluateJavascript(js, value -> {
                    android.util.Log.d("NOVYRA_OAUTH", "JS ejecutado: " + value);
                    oauthYaProcesado = false;
                });
            }, 1000);
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Interfaz JS ↔ Android
        getBridge().getWebView().addJavascriptInterface(new Object() {
            @android.webkit.JavascriptInterface
            public void guardarArchivo(String data) {
                try {
                    File path = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    File file = new File(path, "novyra_backup.json");

                    FileOutputStream fos = new FileOutputStream(file);
                    fos.write(data.getBytes());
                    fos.close();

                    runOnUiThread(() ->
                            Toast.makeText(MainActivity.this, "Backup guardado en Descargas ✅", Toast.LENGTH_LONG).show()
                    );

                } catch (Exception e) {
                    e.printStackTrace();

                    runOnUiThread(() ->
                            Toast.makeText(MainActivity.this, "Error al guardar ❌", Toast.LENGTH_LONG).show()
                    );
                }
            }
        }, "Android");
    }
}
