import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Appearance } from 'react-native';
import { supabase } from '@/lib/supabase-client';
import { useAuth } from '@/lib/auth-context';

export type ThemeMode = 'system' | 'light' | 'dark';
export type AccentColor = 'blue' | 'orange' | 'green' | 'purple';
export type AppLanguage = 'fr' | 'en';

export type UserPreferences = {
  user_id: string;
  theme_mode: ThemeMode;
  accent_color: AccentColor;
  language: AppLanguage;
  notify_messages: boolean;
  notify_quotes: boolean;
  updated_at: string;
};

type PreferenceUpdate = Partial<Omit<UserPreferences, 'user_id' | 'updated_at'>>;
type PreferencesContextValue = {
  preferences: UserPreferences;
  loading: boolean;
  error: string | null;
  updatePreferences: (update: PreferenceUpdate) => Promise<void>;
};

const DEFAULT_PREFERENCES: UserPreferences = {
  user_id: '',
  theme_mode: 'system',
  accent_color: 'blue',
  language: 'fr',
  notify_messages: true,
  notify_quotes: true,
  updated_at: '',
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const load = async () => {
      try {
        await Promise.resolve();
        if (!active) return;
        setLoading(true);
        setError(null);
        if (!userId) {
          setPreferences(DEFAULT_PREFERENCES);
          return;
        }

        let { data, error: loadError } = await supabase
          .from('user_preferences')
          .select('user_id, theme_mode, accent_color, language, notify_messages, notify_quotes, updated_at')
          .eq('user_id', userId)
          .maybeSingle();

        if (loadError) throw loadError;
        if (!data) {
          const created = await supabase
            .from('user_preferences')
            .insert({ user_id: userId })
            .select('user_id, theme_mode, accent_color, language, notify_messages, notify_quotes, updated_at')
            .single();

          if (created.error?.code === '23505') {
            const retry = await supabase
              .from('user_preferences')
              .select('user_id, theme_mode, accent_color, language, notify_messages, notify_quotes, updated_at')
              .eq('user_id', userId)
              .single();
            if (retry.error) throw retry.error;
            data = retry.data;
          } else {
            if (created.error) throw created.error;
            data = created.data;
          }
        }

        if (!active) return;
        setPreferences(data as UserPreferences);
        channel = supabase
          .channel(`preferences-live-${userId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'user_preferences',
              filter: `user_id=eq.${userId}`,
            },
            (payload) => {
              if (payload.eventType !== 'DELETE') setPreferences(payload.new as UserPreferences);
            }
          )
          .subscribe((status) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              console.warn('[preferences] Synchronisation en temps réel indisponible:', status);
            }
          });
      } catch (loadError) {
        if (!active) return;
        console.error('[preferences] Chargement impossible:', loadError);
        setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les préférences.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    Appearance.setColorScheme(preferences.theme_mode === 'system' ? 'unspecified' : preferences.theme_mode);
  }, [preferences.theme_mode]);

  const updatePreferences = useCallback(
    async (update: PreferenceUpdate) => {
      if (!userId) throw new Error('Connectez-vous pour modifier ces préférences.');
      const { data, error: updateError } = await supabase
        .from('user_preferences')
        .update({ ...update, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .select('user_id, theme_mode, accent_color, language, notify_messages, notify_quotes, updated_at')
        .single();

      if (updateError) {
        setError(updateError.message);
        throw updateError;
      }
      setPreferences(data as UserPreferences);
      setError(null);
    },
    [userId]
  );

  const value = useMemo(
    () => ({ preferences, loading, error, updatePreferences }),
    [preferences, loading, error, updatePreferences]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function useUserPreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('useUserPreferences doit être utilisé dans <UserPreferencesProvider>');
  return value;
}

const ENGLISH_TEXT: Record<string, string> = {
  'Accueil': 'Home',
  'Tableau de bord': 'Dashboard',
  'Explorer': 'Explore',
  'Recherche': 'Search',
  'Connexion': 'Sign in',
  'Mes devis': 'My requests',
  'Messages': 'Messages',
  'Profil': 'Profile',
  'Paramètres': 'Settings',
  'Notifications': 'Notifications',
  'Alertes': 'Alerts',
  'Mot de passe oublié': 'Forgot password',
  'Nouveau mot de passe': 'New password',
  'Compte': 'Account',
  'Paramètres du compte': 'Account settings',
  'Personnalisez votre expérience': 'Customize your experience',
  'Gérez votre profil, votre apparence et vos notifications': 'Manage your profile, appearance, and notifications',
  'Informations du profil': 'Profile information',
  'Nom complet': 'Full name',
  'Téléphone': 'Phone',
  'Ville': 'City',
  'Profession': 'Profession',
  'Description de vos services': 'Describe your services',
  'Enregistrer': 'Save',
  'Disponibilité': 'Availability',
  'Votre profil apparaît dans la recherche.': 'Your profile appears in search results.',
  'Votre profil est masqué de la recherche.': 'Your profile is hidden from search results.',
  'Informations légales': 'Legal information',
  'Politique de confidentialité': 'Privacy policy',
  'Conditions d’utilisation': 'Terms of use',
  'Zone de confidentialité': 'Privacy',
  'Préférences indisponibles': 'Preferences unavailable',
  'Enregistrement impossible': 'Could not save',
  'Veuillez réessayer.': 'Please try again.',
  'Vous pouvez transmettre une demande de suppression de votre compte à notre équipe.': 'You can submit an account deletion request to our team.',
  'Demander la suppression du compte': 'Request account deletion',
  'Notifications en temps réel': 'Real-time notifications',
  'Être averti des nouveaux messages': 'Notify me about new messages',
  'Être averti de mes demandes de devis': 'Notify me about quote requests',
  'Apparence': 'Appearance',
  'Thème': 'Theme',
  'Suivre l’appareil': 'Use device setting',
  'Clair': 'Light',
  'Sombre': 'Dark',
  'Couleur': 'Accent color',
  'Langue': 'Language',
  'Français': 'French',
  'Anglais': 'English',
  'Bleu': 'Blue',
  'Orange': 'Orange',
  'Vert': 'Green',
  'Violet': 'Purple',
  'Aucune notification pour le moment.': 'No notifications yet.',
  'Notifications système': 'System notifications',
  'Activées sur cet appareil': 'Enabled on this device',
  'Désactivées sur cet appareil': 'Disabled on this device',
  'Notifications push indisponibles': 'Push notifications unavailable',
  'Activées': 'Enabled',
  'Autoriser': 'Allow',
  'Tout marquer comme lu': 'Mark all as read',
  'Nouvelle demande attribuée': 'New request assigned',
  'Artisan trouvé': 'Professional assigned',
  'Professional assigned': 'Professional assigned',
  'New request assigned': 'New request assigned',
  'Mise à jour de votre demande': 'Your request was updated',
  'Nouveau message du support': 'New support message',
  'Nouveau message': 'New message',
  'Artisans proches': 'Nearby professionals',
  'Rechercher un artisan': 'Search professionals',
  'Effacer la recherche': 'Clear search',
  'Catégories': 'Categories',
  'Toutes les catégories': 'All categories',
  'Choisir une catégorie': 'Choose a category',
  'Fermer': 'Close',
  'Aucun résultat pour cette recherche.': 'No results for this search.',
  'Nouvel artisan': 'New professional',
  'Disponible': 'Available',
  'Artisans disponibles': 'Available professionals',
  'Des professionnels autour de vous': 'Professionals near you',
  'La carte sera affichée après la localisation.': 'The map will appear after location access is granted.',
  'Tous les métiers': 'All trades',
  'Recherche en cours…': 'Searching…',
  'résultat': 'result',
  'résultats': 'results',
  'Aucun artisan disponible à proximité.': 'No professionals available nearby.',
  'Demander un devis': 'Request a quote',
  'Professionnel': 'Professional',
  'Artisan': 'Craftsperson',
  'Bonjour': 'Hello',
  'Réessayer': 'Try again',
  'Compte artisan': 'Craftsperson account',
  'Compte client': 'Client account',
  'Mon compte': 'My account',
  'Client': 'Client',
  'Voulez-vous vraiment fermer votre session ?': 'Are you sure you want to sign out?',
  'Annuler': 'Cancel',
  'Déconnexion impossible': 'Could not sign out',
  'Réessayez plus tard.': 'Please try again later.',
  'Non renseigné': 'Not provided',
  'Aucun message. Écrivez le premier !': 'No messages yet. Send the first one!',
  'Votre message': 'Your message',
  'Discussion': 'Conversation',
  'Aucune discussion.': 'No conversations.',
  'Contacter l’équipe support': 'Contact support',
  'Nouvelles demandes': 'New requests',
  'En cours': 'In progress',
  'Terminées': 'Completed',
  'Revenus': 'Revenue',
  'Aucune nouvelle demande.': 'No new requests.',
  'Travaux en cours': 'Work in progress',
  'Aucun travail en cours.': 'No work in progress.',
  'Demandes assignées par l’Admin': 'Requests assigned by admin',
  'Accepter': 'Accept',
  'Refuser': 'Decline',
  'Chat': 'Chat',
  'Marquer terminé': 'Mark complete',
  'Non renseignée': 'Not provided',
  'ESPACE ARTISAN': 'CRAFTSPERSON AREA',
  'Espace artisan': 'Craftsperson area',
  'Demandes reçues': 'Received requests',
  'Visible par les clients proches': 'Visible to nearby clients',
  'Masqué des recherches': 'Hidden from search',
  'Accueil et carte': 'Home and map',
  'Ouvrir le menu': 'Open menu',
  'Fermer le menu': 'Close menu',
  'Catégorie requise': 'Category required',
  'Choisissez le type de service.': 'Choose a service type.',
  'Description trop courte': 'Description is too short',
  'Décrivez votre besoin (10 caractères minimum).': 'Describe your request (at least 10 characters).',
  'Budget invalide': 'Invalid budget',
  'Entrez un montant valide ou laissez vide.': 'Enter a valid amount or leave it blank.',
  'Demande envoyée': 'Request sent',
  'Elle est en attente : l’équipe va l’attribuer à l’artisan le plus adapté.': 'Your request is pending assignment to a suitable professional.',
  'Chat indisponible': 'Chat unavailable',
  'Toutes': 'All',
  'En attente': 'Pending',
  'Attribuées': 'Assigned',
  'Catégorie *': 'Category *',
  'Titre': 'Title',
  'Ex : Fuite sous l’évier': 'E.g. leaking sink',
  'Description *': 'Description *',
  'Décrivez précisément votre besoin': 'Describe what you need in detail',
  'Urgence': 'Urgency',
  'Flexible': 'Flexible',
  'Normale': 'Normal',
  'Urgente': 'Urgent',
  'Adresse d’intervention': 'Service address',
  'Quartier, rue, ville': 'Neighborhood, street, city',
  'Budget estimé (optionnel)': 'Estimated budget (optional)',
  'Montant': 'Amount',
  'Envoyer la demande': 'Send request',
  'Discuter avec Artisant (support)': 'Chat with Artisant support',
  'Mes demandes': 'My requests',
  'Aucune demande dans cette liste.': 'No requests in this list.',
  'En attente d’un artisan': 'Waiting for a professional',
  'Attribuée': 'Assigned',
  'Attribuée · en attente de réponse': 'Assigned · awaiting response',
  'Acceptée': 'Accepted',
  'Refusée': 'Declined',
  'Terminée': 'Completed',
  'Demande de devis': 'Quote request',
  'Urgent': 'Urgent',
  'Budget': 'Budget',
  'Aucun artisan attribué pour le moment.': 'No professional assigned yet.',
  'Sans description': 'No description',
  'Prix': 'Price',
  'Se déconnecter': 'Sign out',
  'Note': 'Rating',
  'Profil enregistré': 'Profile saved',
  'Vos informations ont été mises à jour.': 'Your information has been updated.',
  'Nom requis': 'Name required',
  'Veuillez saisir votre nom complet.': 'Please enter your full name.',
  'Mise à jour impossible': 'Could not update',
  'Demande déjà reçue': 'Request already received',
  'Une demande de suppression de votre compte est déjà en cours de traitement.': 'An account deletion request is already being processed.',
  'Votre demande de suppression a été transmise à notre équipe. Votre compte reste actif jusqu’à son traitement.': 'Your deletion request has been sent to our team. Your account remains active until it is processed.',
  'Votre demande sera transmise à notre équipe. Le compte ne sera pas supprimé immédiatement.': 'Your request will be sent to our team. Your account will not be deleted immediately.',
  'Envoi impossible': 'Could not send',
  'Aucun message': 'No messages',
  'Ouvrir mon tableau de bord': 'Open my dashboard',
};

export function useTranslate() {
  const { preferences } = useUserPreferences();
  return useCallback(
    (text: string) => preferences.language === 'en' ? (ENGLISH_TEXT[text] ?? text) : text,
    [preferences.language]
  );
}
