# URBANSYNC – App móvil (Flutter, Android)

App para los tres roles del sistema: **ciudadano** (reporta y sigue sus incidentes),
**supervisor** (confirma, prioriza y asigna) y **ente de gestión** (atiende y resuelve).
Muestra **notificaciones del sistema** cuando cambia el estado de un reporte o se asigna un incidente.

## Requisitos

- Flutter 3 (probado con 3.47) y Android SDK (`flutter doctor` sin errores en *Android toolchain*).
- Backend levantado: en la raíz del repo `docker compose up -d` y `curl localhost:8080/health`.
- Celular Android 8.0 o superior (minSdk 26), o un emulador.

## Configurar la URL del backend

La app lee la URL del gateway desde `--dart-define=API_URL=...` (ver `lib/config.dart`):

| Dónde corre la app | Comando |
|---|---|
| Emulador Android | `flutter run` (usa `http://10.0.2.2:8080`) |
| **Celular por USB (recomendado)** | `adb reverse tcp:8080 tcp:8080` y luego `flutter run --dart-define=API_URL=http://127.0.0.1:8080` |
| Celular por Wi-Fi (misma red) | `flutter run --dart-define=API_URL=http://IP_DEL_PC:8080` y permitir el puerto 8080 en el firewall de Windows |

`adb reverse` hace que el `localhost:8080` del celular llegue al `localhost:8080` del PC por el
cable USB: no hace falta conocer la IP del PC ni abrir el firewall.

## Correr en un celular por USB (paso a paso)

1. **Activar la depuración USB** en el celular: *Ajustes → Acerca del teléfono* → tocar 7 veces
   *Número de compilación* → *Ajustes → Sistema → Opciones de desarrollador* → activar
   **Depuración USB** (en Xiaomi activar también *Instalar vía USB*).
2. Conectar el cable USB y **aceptar** el aviso "¿Permitir depuración USB?" (marcar *Permitir siempre*).
3. En PowerShell, desde `app_movil/`:
   ```powershell
   .\correr_en_celular.ps1
   ```
   El script verifica el backend, detecta el celular, ejecuta `adb reverse` y corre `flutter run`.
   (Equivalente manual: `adb devices`, `adb reverse tcp:8080 tcp:8080`,
   `flutter run --dart-define=API_URL=http://127.0.0.1:8080`.)
4. La primera vez que abra, la app pide **permiso de notificaciones** y, al crear un reporte,
   **permiso de ubicación**: aceptar ambos.

> Si desconectas el cable, vuelve a ejecutar `adb reverse tcp:8080 tcp:8080` al reconectar.

> **Error `Unable to delete directory ... mergeDebugAssets`** (proyecto dentro de OneDrive):
> OneDrive bloquea los archivos de `build/` mientras Gradle compila. `correr_en_celular.ps1` lo
> evita creando `build/` como enlace a `%LOCALAPPDATA%\urbansync_build` (fuera de OneDrive).
> Si vuelve a pasar: `cd android; .\gradlew --stop; cd ..` y ejecutar de nuevo el script.

## Generar el APK

```powershell
flutter build apk --release --dart-define=API_URL=http://127.0.0.1:8080   # para usar con adb reverse
flutter build apk --release --dart-define=API_URL=http://IP_DEL_PC:8080   # para Wi-Fi
```
Queda en `build/app/outputs/flutter-apk/app-release.apk` (instalar con `adb install -r <apk>`).

## Cuentas de demostración

Contraseña de todas: `Urbansync2026*` (también se pueden elegir desde *Cuentas de demostración* en el login).

| Rol | Correo |
|---|---|
| Ciudadano | ciudadano@urbansync.co |
| Supervisor | supervisor@urbansync.co |
| Ente infraestructura / seguridad / emergencias | ente.infra@ / ente.seguridad@ / ente.emergencias@urbansync.co |

## Probar las notificaciones en vivo (criterio de aceptación de la Fase 6)

Con el celular en un rol y el PC haciendo de los otros roles (`pruebas/demo_app.sh`, en Git Bash):

**A. Notificación al ente cuando se le asigna un incidente**
1. En el celular, inicia sesión como `ente.infra@urbansync.co` y deja la app abierta o en segundo plano.
2. En el PC: `bash pruebas/demo_app.sh crear infraestructura` y luego `bash pruebas/demo_app.sh asignar`.
3. En ≤ 30 s aparece la notificación **"Nuevo incidente asignado"**. Tocarla abre la pestaña *Alertas*.

**B. Notificación al ciudadano cuando el ente cambia el estado**
1. En el celular, inicia sesión como `ciudadano@urbansync.co` y crea un reporte (*Nuevo reporte*).
2. En el PC: `bash pruebas/demo_app.sh asignar` (confirma y asigna ese reporte).
3. En el PC: `bash pruebas/demo_app.sh atender infraestructura` (→ *en atención*) y otra vez (→ *resuelto*).
4. En el celular llegan **"Reporte confirmado"**, **"Reporte asignado"**, **"Reporte en atención"** y
   **"Reporte resuelto"**; el reporte muestra el historial completo.

**C. Flujo completo solo desde el celular** (cerrando y abriendo sesión con cada rol):
ciudadano crea → supervisor (pestaña *Bandeja*) confirma y asigna → ente (pestaña *Asignaciones*)
inicia atención y resuelve → ciudadano ve el reporte resuelto y sus alertas.

## Estructura

```
lib/
├── main.dart                 # provider de sesión, tema Material 3, login o inicio
├── config.dart               # API_URL, timeouts, intervalo del polling
├── api/cliente_api.dart      # http + JWT + timeout 10 s + errores en español; 401 -> cerrar sesión
├── modelos/                  # usuario, incidente (+historial, punto del mapa), asignacion, notificacion, categoria
├── estado/sesion.dart        # ChangeNotifier; token en flutter_secure_storage
├── servicios/alertas.dart    # polling 30 s + flutter_local_notifications + badge
├── servicios/ubicacion.dart  # GPS con geolocator (si falla: elegir en el mapa)
├── widgets/                  # etiquetas, errores con "Reintentar", capas de flutter_map
└── pantallas/
    ├── login.dart, registro.dart, inicio.dart (navegación inferior por rol), navegacion.dart
    ├── ciudadano/ (mis_reportes, nuevo_reporte, detalle_reporte)
    ├── supervisor/ (bandeja, detalle_supervisor)
    ├── ente/ (mis_asignaciones, actualizar_estado)
    └── comun/ (mapa, notificaciones, perfil)
```

## Verificación

```powershell
flutter analyze   # sin problemas
flutter test      # pruebas de los modelos
```
