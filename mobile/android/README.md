# Android integration notes

This repository keeps generated Flutter Android boilerplate out of source
control. From this directory, run `flutter create .` once to generate the
Android runner and Gradle files.

For local `ws://` development, add the following to
`android/app/src/main/AndroidManifest.xml` inside the `<manifest>` element:

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

Recent Android versions also require a network security config if cleartext
traffic is blocked. Prefer `wss://` behind TLS in production. For the Android
emulator, `10.0.2.2` points to the host; a physical device must use the
computer's LAN address and an accessible port.

On first launch, Android 11 and newer opens the system **All files access**
screen. Enable access for Remote Storage Bridge and return to the app. Android
13 and newer may also ask for notification permission because the agent uses a
foreground service. The app can browse shared storage under
`/storage/emulated/0`, but it cannot access another app's private sandbox.
