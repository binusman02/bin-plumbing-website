import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services")
}

val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android {
    namespace = "com.flowguard.plumbing.flowguard_plumbing"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.flowguard.plumbing.flowguard_plumbing"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    flavorDimensions += "app"
    productFlavors {
        create("customer") {
            dimension = "app"
            applicationId = "com.flowguard.plumbing.customer"
            resValue("string", "app_name", "FlowGuard Plumbing")
        }
        create("technician") {
            dimension = "app"
            applicationId = "com.flowguard.plumbing.technician"
            resValue("string", "app_name", "FlowGuard Technician")
        }
    }

    signingConfigs {
        create("release") {
            val storeFilePath = (keystoreProperties.getProperty("storeFile")
                ?: System.getenv("FLOWGUARD_KEYSTORE_FILE"))?.trim()
            val storePass = (keystoreProperties.getProperty("storePassword")
                ?: System.getenv("FLOWGUARD_KEYSTORE_PASSWORD"))?.trim()
            val alias = (keystoreProperties.getProperty("keyAlias")
                ?: System.getenv("FLOWGUARD_KEY_ALIAS"))?.trim()
            val keyPass = (keystoreProperties.getProperty("keyPassword")
                ?: System.getenv("FLOWGUARD_KEY_PASSWORD"))?.trim()

            if (!storeFilePath.isNullOrEmpty() && !storePass.isNullOrEmpty() &&
                !alias.isNullOrEmpty() && !keyPass.isNullOrEmpty()) {
                storeFile = file(storeFilePath)
                storePassword = storePass
                keyAlias = alias
                keyPassword = keyPass
            }
        }
    }

    buildTypes {
        release {
            val releaseConfig = signingConfigs.getByName("release")
            if (releaseConfig.storeFile == null || !releaseConfig.storeFile!!.exists()) {
                val isReleaseTask = gradle.startParameter.taskNames.any {
                    it.contains("Release", ignoreCase = true)
                }
                if (isReleaseTask) {
                    throw GradleException(
                        "Production release signing is required. Configure mobile/android/key.properties or FLOWGUARD_KEYSTORE_* env vars. Debug fallback is disabled."
                    )
                }
            } else {
                signingConfig = releaseConfig
            }
        }
    }
}

flutter {
    source = "../.."
}
