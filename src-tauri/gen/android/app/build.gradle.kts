import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

// The release key, kept outside the repository (docs/phone/ANDROID-BUILD.md, "Signing"):
// ~/.inmaa-android/keystore.properties, or the file INMAA_ANDROID_KEYSTORE_PROPERTIES names.
val keystoreProperties = Properties().apply {
    val path = System.getenv("INMAA_ANDROID_KEYSTORE_PROPERTIES")
        ?: "${System.getProperty("user.home")}/.inmaa-android/keystore.properties"
    val propFile = file(path)
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

// A test build (npm run android:build:test) can be driven over Chrome DevTools Protocol. It is another app
// (com.hamawebdev.inmaa_pro.test, «إنماء برو (اختبار)»): installed on a phone that has the program, it sits beside
// it and can never replace it, nor read its data.
val webViewDebug = System.getenv("INMAA_ANDROID_TEST") == "1"

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

android {
    compileSdk = 36
    namespace = "com.hamawebdev.inmaa_pro"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "com.hamawebdev.inmaa_pro"
        minSdk = 24
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
        buildConfigField("boolean", "WEBVIEW_DEBUG", webViewDebug.toString())
        if (webViewDebug) {
            applicationIdSuffix = ".test"
            versionNameSuffix = "-test"
        }
        manifestPlaceholders["appLabel"] = if (webViewDebug) "إنماء برو (اختبار)" else "إنماء برو"
    }
    signingConfigs {
        if (keystoreProperties.containsKey("storeFile")) {
            create("release") {
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            signingConfigs.findByName("release")?.let { signingConfig = it }
            isMinifyEnabled = true
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")