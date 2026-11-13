package expo.modules.restorecredentials

import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CreateRestoreCredentialRequest
import androidx.credentials.CreateRestoreCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetRestoreCredentialOption
import androidx.credentials.RestoreCredential
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

// Restore Credentials (Zero-Tap) : la clé WebAuthn est sauvegardée par Google Play
// et restaurée sur un nouvel appareil sans que l'utilisateur ait à se reconnecter.
class RestoreCredentialsModule : Module() {
  private val scope = CoroutineScope(Dispatchers.Main)

  override fun definition() = ModuleDefinition {
    Name("RestoreCredentials")

    AsyncFunction("createRestoreKey") { requestJson: String, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("E_NO_ACTIVITY", "Activité Android introuvable", null)
        return@AsyncFunction
      }
      val manager = CredentialManager.create(activity)
      launchCreate(manager, activity, requestJson, cloudBackup = true, promise = promise)
    }

    AsyncFunction("getRestoreKey") { requestJson: String, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("E_NO_ACTIVITY", "Activité Android introuvable", null)
        return@AsyncFunction
      }
      val manager = CredentialManager.create(activity)
      val request = GetCredentialRequest(listOf(GetRestoreCredentialOption(requestJson)))
      scope.launch {
        try {
          val response = manager.getCredential(activity, request)
          val credential = response.credential as? RestoreCredential
          if (credential == null) {
            promise.reject("E_NO_KEY", "Aucune clé de restauration", null)
          } else {
            promise.resolve(credential.authenticationResponseJson)
          }
        } catch (e: Exception) {
          promise.reject("E_GET_FAILED", e.message ?: "Lecture de la clé impossible", e)
        }
      }
    }

    AsyncFunction("clearRestoreKey") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve(null)
        return@AsyncFunction
      }
      val manager = CredentialManager.create(activity)
      scope.launch {
        try {
          manager.clearCredentialState(
            ClearCredentialStateRequest(ClearCredentialStateRequest.TYPE_CLEAR_RESTORE_CREDENTIAL)
          )
          promise.resolve(null)
        } catch (e: Exception) {
          // Effacer une clé absente n'est pas une erreur bloquante pour la déconnexion.
          promise.resolve(null)
        }
      }
    }
  }

  private fun launchCreate(
    manager: CredentialManager,
    activity: android.app.Activity,
    requestJson: String,
    cloudBackup: Boolean,
    promise: Promise
  ) {
    scope.launch {
      try {
        val request = CreateRestoreCredentialRequest(requestJson, cloudBackup)
        val response = manager.createCredential(activity, request) as CreateRestoreCredentialResponse
        promise.resolve(response.responseJson)
      } catch (e: Exception) {
        // Sauvegarde cloud indisponible (E2EE non configuré) : on retente sans sauvegarde cloud.
        if (cloudBackup && e.javaClass.simpleName == "E2eeUnavailableException") {
          launchCreate(manager, activity, requestJson, cloudBackup = false, promise = promise)
        } else {
          promise.reject("E_CREATE_FAILED", e.message ?: "Création de la clé impossible", e)
        }
      }
    }
  }
}
