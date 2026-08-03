package com.novyra.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.widget.RemoteViews;
import com.novyra.app.MainActivity;

import java.text.NumberFormat;
import java.util.Locale;

public class NOVYRAWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    public static void forzarActualizacion(Context context) {
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        android.content.ComponentName thisWidget = new android.content.ComponentName(
                context, NOVYRAWidget.class);
        int[] allWidgetIds = appWidgetManager.getAppWidgetIds(thisWidget);
        for (int widgetId : allWidgetIds) {
            updateAppWidget(context, appWidgetManager, widgetId);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if ("com.novyra.app.UPDATE_WIDGET".equals(intent.getAction())) {
            forzarActualizacion(context);
        }
    }

    static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.novyra_widget);

        try {
            String monedaVal    = leerWidget(context, "widget_moneda");
            if (monedaVal == null) monedaVal = "COP";

            String totalMesStr  = leerWidget(context, "widget_totalMes");
            String totalHoyStr  = leerWidget(context, "widget_totalHoy");
            String rachaStr     = leerWidget(context, "widget_racha");
            String limiteStr    = leerWidget(context, "widget_limite");

            double totalMes     = totalMesStr  != null ? Double.parseDouble(totalMesStr)  : 0;
            double totalHoy     = totalHoyStr  != null ? Double.parseDouble(totalHoyStr)  : 0;
            int    racha        = rachaStr     != null ? Integer.parseInt(rachaStr)        : 0;
            double limiteDiario = limiteStr    != null ? Double.parseDouble(limiteStr)     : 0;

            views.setTextViewText(R.id.widget_total_mes, formatearMonto(totalMes, monedaVal));
            views.setTextViewText(R.id.widget_racha, racha + " días");

            if (limiteDiario > 0) {
                int pct = (int)((totalHoy / limiteDiario) * 100);
                views.setTextViewText(R.id.widget_limite,
                        formatearMonto(totalHoy, monedaVal) + " (" + pct + "%)");
                int color;
                if (pct >= 100)     color = Color.parseColor("#ef4444");
                else if (pct >= 80) color = Color.parseColor("#f59e0b");
                else                color = Color.parseColor("#22c55e");
                views.setTextColor(R.id.widget_limite, color);
            } else {
                views.setTextViewText(R.id.widget_limite, "—");
                views.setTextColor(R.id.widget_limite, Color.parseColor("#22c55e"));
            }

        } catch (Exception e) {
            android.util.Log.e("NOVYRA_WIDGET", "Error: " + e.getMessage());
            views.setTextViewText(R.id.widget_total_mes, "$ 0");
            views.setTextViewText(R.id.widget_limite, "—");
            views.setTextViewText(R.id.widget_racha, "0 días");
        }

        // Tap abre la app
        Intent intent = new Intent(context, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_logo, pendingIntent);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    private static String leerWidget(Context context, String key) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(
                    "CapacitorStorage", Context.MODE_PRIVATE);
            String val = prefs.getString(key, null);
            android.util.Log.d("NOVYRA_WIDGET", "leerWidget " + key + " = " + val);
            return val;
        } catch (Exception e) {
            android.util.Log.e("NOVYRA_WIDGET", "Error leerWidget: " + e.getMessage());
            return null;
        }
    }

    private static String formatearMonto(double monto, String moneda) {
        switch (moneda) {
            case "USD": return "US$ " + String.format(Locale.US, "%.2f", monto);
            case "MXN": return "MX$ " + String.format(Locale.US, "%.0f", monto);
            default:
                NumberFormat nf = NumberFormat.getNumberInstance(new Locale("es", "CO"));
                return "$ " + nf.format((long) monto);
        }
    }
}
