import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePickerAsset } from 'expo-image-picker';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase-client';
import { useAuth } from '@/lib/auth-context';

const BUCKET = 'artisan-projects';
const MAX_PHOTOS = 6;
const MAX_PRESENTATION_BYTES = 20 * 1024 * 1024;
const PRESENTATION_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

type ProjectMedia = {
  id: string;
  storage_path: string;
  caption: string;
  position: number;
};

type ProjectComment = {
  id: string;
  author_name: string;
  body: string;
  created_at: string;
};

type Project = {
  id: string;
  artisan_id: string;
  title: string;
  description: string;
  pptx_path: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  status: 'draft' | 'published';
  media: ProjectMedia[];
  comments: ProjectComment[];
  liked: boolean;
};

const publicUrl = (storagePath: string) =>
  supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;

export default function PortfolioScreen() {
  const params = useLocalSearchParams<{ artisanId?: string | string[] }>();
  const requestedArtisanId = Array.isArray(params.artisanId) ? params.artisanId[0] : params.artisanId;
  const { profile, session } = useAuth();
  const router = useRouter();
  const viewerId = session?.user.id;
  const artisanId = requestedArtisanId ?? profile?.id ?? null;
  const managerMode = !requestedArtisanId;
  const canManage = managerMode && profile?.role === 'artisan' && profile.id === artisanId;

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [working, setWorking] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [artisanProfession, setArtisanProfession] = useState<string | null>(null);
  const [photos, setPhotos] = useState<ImagePickerAsset[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busyLikes, setBusyLikes] = useState<Record<string, boolean>>({});

  const loadProjects = useCallback(async () => {
    if (!artisanId) {
      setProjects([]);
      setArtisanProfession(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      let projectQuery = supabase
        .from('artisan_projects')
        .select('id, artisan_id, title, description, pptx_path, like_count, comment_count, created_at, status')
        .eq('artisan_id', artisanId)
        .order('created_at', { ascending: false });
      if (!canManage) projectQuery = projectQuery.eq('status', 'published');

      const [projectsResult, profileResult] = await Promise.all([
        projectQuery.limit(30),
        supabase.from('profiles').select('profession').eq('id', artisanId).maybeSingle(),
      ]);
      if (projectsResult.error) throw projectsResult.error;
      if (profileResult.error) throw profileResult.error;
      const rows = projectsResult.data;
      setArtisanProfession(profileResult.data?.profession ?? null);

      const ids = (rows ?? []).map((row) => row.id as string);
      if (ids.length === 0) {
        setProjects([]);
        return;
      }

      const [mediaResult, commentsResult, likesResult] = await Promise.all([
        supabase
          .from('artisan_project_media')
          .select('id, project_id, storage_path, caption, position')
          .in('project_id', ids)
          .order('position', { ascending: true }),
        supabase
          .from('artisan_project_comments')
          .select('id, project_id, author_name, body, created_at')
          .in('project_id', ids)
          .order('created_at', { ascending: false })
          .limit(150),
        viewerId
          ? supabase
              .from('artisan_project_likes')
              .select('project_id')
              .in('project_id', ids)
              .eq('user_id', viewerId)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (mediaResult.error) throw mediaResult.error;
      if (commentsResult.error) throw commentsResult.error;
      if (likesResult.error) throw likesResult.error;

      const mediaByProject = new Map<string, ProjectMedia[]>();
      for (const media of mediaResult.data ?? []) {
        const bucket = mediaByProject.get(media.project_id) ?? [];
        bucket.push(media as ProjectMedia);
        mediaByProject.set(media.project_id, bucket);
      }

      const commentsByProject = new Map<string, ProjectComment[]>();
      for (const comment of commentsResult.data ?? []) {
        const bucket = commentsByProject.get(comment.project_id) ?? [];
        bucket.push(comment as ProjectComment);
        commentsByProject.set(comment.project_id, bucket);
      }

      const likedProjects = new Set((likesResult.data ?? []).map((like) => like.project_id as string));
      setProjects((rows ?? []).map((row) => ({
        ...row,
        media: mediaByProject.get(row.id) ?? [],
        comments: commentsByProject.get(row.id) ?? [],
        liked: likedProjects.has(row.id),
      })) as Project[]);
    } catch (error) {
      console.error('[portfolio] chargement impossible:', error);
      Alert.alert('Réalisations indisponibles', error instanceof Error ? error.message : 'Réessayez plus tard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [artisanId, canManage, viewerId]);

  useEffect(() => {
    // Load the feed once its route and session identifiers are available.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProjects();
  }, [loadProjects]);

  const requireLogin = () => {
    if (session?.user.id) return true;
    router.push('/(auth)/login');
    return false;
  };

  const requireClient = () => {
    if (!requireLogin()) return false;
    if (profile?.role !== 'client') {
      Alert.alert('Action réservée', 'Connectez-vous avec un compte client pour aimer ou commenter une réalisation.');
      return false;
    }
    return true;
  };

  const choosePhotos = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: MAX_PHOTOS,
        quality: 0.9,
      });
      if (result.canceled) return;
      setPhotos((current) => [...current, ...result.assets].slice(0, MAX_PHOTOS));
    } catch (error) {
      Alert.alert('Photos indisponibles', error instanceof Error ? error.message : 'Réessayez plus tard.');
    }
  };

  const uploadPhoto = async (userId: string, projectId: string, asset: ImagePickerAsset, position: number) => {
    const mimeType = asset.mimeType?.toLowerCase() ?? 'image/jpeg';
    const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/jpeg' ? 'jpg' : null;
    if (!extension) {
      throw new Error('Choisissez des photos au format JPEG ou PNG.');
    }
    if (asset.fileSize && asset.fileSize > 8 * 1024 * 1024) {
      throw new Error('Chaque photo doit faire moins de 8 Mo.');
    }

    const response = await fetch(asset.uri);
    if (!response.ok) throw new Error('Une photo n’a pas pu être lue.');
    const path = `${userId}/${projectId}/slide-${position + 1}.${extension}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, await response.arrayBuffer(), {
      contentType: mimeType,
      upsert: false,
    });
    if (error) throw error;
    return path;
  };

  const publishFromPhotos = async () => {
    if (!requireLogin()) return;
    if (!canManage || !session?.user.id) {
      Alert.alert('Accès réservé', 'Seul un artisan peut publier une réalisation.');
      return;
    }
    if (!title.trim() || !description.trim() || photos.length === 0) {
      Alert.alert('Informations manquantes', 'Ajoutez un titre, une description et au moins une photo.');
      return;
    }
    if (photos.some((photo) => photo.mimeType && !['image/jpeg', 'image/png'].includes(photo.mimeType.toLowerCase()))) {
      Alert.alert('Format de photo invalide', 'Choisissez des photos au format JPEG ou PNG.');
      return;
    }
    if (photos.some((photo) => (photo.fileSize ?? 0) > 8 * 1024 * 1024)) {
      Alert.alert('Photo trop volumineuse', 'Chaque photo doit faire moins de 8 Mo.');
      return;
    }
    if (photos.reduce((total, photo) => total + (photo.fileSize ?? 0), 0) > 45 * 1024 * 1024) {
      Alert.alert('Photos trop volumineuses', 'La taille cumulée des photos doit rester sous 45 Mo.');
      return;
    }

    setWorking(true);
    let projectId: string | null = null;
    const uploadedPaths: string[] = [];
    try {
      const { data: createdProjectId, error: insertError } = await supabase.rpc('create_artisan_project_draft', {
        p_title: title.trim(),
        p_description: description.trim(),
      });
      if (insertError || typeof createdProjectId !== 'string') {
        throw insertError ?? new Error('La réalisation n’a pas pu être créée.');
      }
      projectId = createdProjectId;

      const mediaRows = [];
      for (const [position, asset] of photos.entries()) {
        const storagePath = await uploadPhoto(session.user.id, createdProjectId, asset, position);
        uploadedPaths.push(storagePath);
        mediaRows.push({
          project_id: createdProjectId,
          storage_path: storagePath,
          caption: '',
          position,
        });
      }
      const { error: mediaError } = await supabase.from('artisan_project_media').insert(mediaRows);
      if (mediaError) throw mediaError;
      const { error: publishError } = await supabase.rpc('publish_artisan_project', {
        p_project_id: createdProjectId,
      });
      if (publishError) throw publishError;
    } catch (error) {
      const cleanupErrors: string[] = [];
      if (uploadedPaths.length) {
        const { error: cleanupError } = await supabase.storage.from(BUCKET).remove(uploadedPaths);
        if (cleanupError) cleanupErrors.push(cleanupError.message);
      }
      if (projectId) {
        const { error: deleteError } = await supabase.from('artisan_projects').delete().eq('id', projectId);
        if (deleteError) cleanupErrors.push(deleteError.message);
      }
      console.error('[portfolio] publication impossible:', error);
      if (error instanceof Error && error.message.includes('PUBLICATION_QUOTA_REACHED')) {
        Alert.alert('Quota atteint', 'Votre offre ne permet plus de publier ce mois-ci. Choisissez une offre supérieure.', [
          { text: 'Voir les offres', onPress: () => router.push('/subscriptions') },
          { text: 'Plus tard', style: 'cancel' },
        ]);
        setWorking(false);
        return;
      }
      Alert.alert(
        'Publication impossible',
        `${error instanceof Error ? error.message : 'Réessayez plus tard.'}${cleanupErrors.length ? ` Nettoyage incomplet : ${cleanupErrors.join('; ')}` : ''}`,
      );
      setWorking(false);
      return;
    }

    setTitle('');
    setDescription('');
    setPhotos([]);
    try {
      await api.post(`/portfolio/${projectId}/presentation`);
    } catch (error) {
      Alert.alert(
        'Réalisation publiée',
        `Les photos sont visibles, mais le PowerPoint n’a pas pu être généré : ${error instanceof Error ? error.message : 'réessayez.'} Vous pourrez relancer sa génération depuis la carte.`,
      );
    } finally {
      await loadProjects();
      setWorking(false);
    }
  };

  const importPresentation = async () => {
    if (!requireLogin()) return;
    if (!canManage || !session?.user.id) {
      Alert.alert('Accès réservé', 'Seul un artisan peut importer une réalisation.');
      return;
    }
    if (!title.trim() || !description.trim()) {
      Alert.alert('Informations manquantes', 'Ajoutez un titre et une description avant d’importer le PowerPoint.');
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: PRESENTATION_MIME,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      if (!asset.name.toLowerCase().endsWith('.pptx')) {
        Alert.alert('Format invalide', 'Sélectionnez un fichier PowerPoint .pptx.');
        return;
      }
      if (asset.size && asset.size > MAX_PRESENTATION_BYTES) {
        Alert.alert('Fichier trop volumineux', 'Le PowerPoint doit faire moins de 20 Mo.');
        return;
      }

      setWorking(true);
      const response = await fetch(asset.uri);
      if (!response.ok) throw new Error('Le fichier PowerPoint n’a pas pu être lu.');
      const file = await response.arrayBuffer();
      if (file.byteLength > MAX_PRESENTATION_BYTES) {
        throw new Error('Le PowerPoint doit faire moins de 20 Mo.');
      }

      const sourcePath = `${session.user.id}/import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pptx`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(sourcePath, file, {
        contentType: PRESENTATION_MIME,
        upsert: false,
      });
      if (uploadError) throw uploadError;

      try {
        await api.post('/portfolio/import', {
          title: title.trim(),
          description: description.trim(),
          source_path: sourcePath,
        });
      } catch (error) {
        const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([sourcePath]);
        if (cleanupError) {
          console.error('[portfolio] suppression du fichier importé impossible:', cleanupError.message);
        }
        throw error;
      }

      setTitle('');
      setDescription('');
      setPhotos([]);
      await loadProjects();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Réessayez plus tard.';
      if (message.toLowerCase().includes('quota mensuel')) {
        Alert.alert('Quota atteint', message, [
          { text: 'Voir les offres', onPress: () => router.push('/subscriptions') },
          { text: 'Plus tard', style: 'cancel' },
        ]);
      } else {
        Alert.alert('Import impossible', message);
      }
    } finally {
      setWorking(false);
    }
  };

  const publishDraft = async (project: Project) => {
    if (project.media.length === 0) {
      Alert.alert('Photos manquantes', 'Ajoutez au moins une photo avant de publier cette réalisation.');
      return;
    }

    setWorking(true);
    try {
      const { error } = await supabase.rpc('publish_artisan_project', { p_project_id: project.id });
      if (error) throw error;
      await loadProjects();
    } catch (error) {
      if (error instanceof Error && error.message.includes('PUBLICATION_QUOTA_REACHED')) {
        Alert.alert('Quota atteint', 'Votre offre ne permet plus de publier ce mois-ci. Choisissez une offre supérieure.', [
          { text: 'Voir les offres', onPress: () => router.push('/subscriptions') },
          { text: 'Plus tard', style: 'cancel' },
        ]);
      } else {
        Alert.alert('Publication impossible', error instanceof Error ? error.message : 'Réessayez plus tard.');
      }
    } finally {
      setWorking(false);
    }
  };

  const toggleLike = async (project: Project) => {
    if (!requireClient() || busyLikes[project.id]) return;
    setBusyLikes((current) => ({ ...current, [project.id]: true }));
    try {
      const result = project.liked
        ? await supabase
            .from('artisan_project_likes')
            .delete()
            .eq('project_id', project.id)
            .eq('user_id', session?.user.id)
        : await supabase.from('artisan_project_likes').insert({
            project_id: project.id,
            user_id: session?.user.id,
          });
      if (result.error) throw result.error;
      setProjects((current) => current.map((item) => item.id === project.id
        ? { ...item, liked: !project.liked, like_count: Math.max(0, item.like_count + (project.liked ? -1 : 1)) }
        : item));
    } catch (error) {
      Alert.alert('Action impossible', error instanceof Error ? error.message : 'Le like n’a pas pu être enregistré.');
    } finally {
      setBusyLikes((current) => ({ ...current, [project.id]: false }));
    }
  };

  const submitComment = async (project: Project) => {
    if (!requireClient() || !session?.user.id) return;
    const body = (comments[project.id] ?? '').trim();
    if (!body) return;
    if (body.length > 1000) {
      Alert.alert('Commentaire trop long', 'Le commentaire est limité à 1 000 caractères.');
      return;
    }
    setWorking(true);
    try {
      const { error } = await supabase.from('artisan_project_comments').insert({
        project_id: project.id,
        user_id: session.user.id,
        body,
      });
      if (error) throw error;
      setComments((current) => ({ ...current, [project.id]: '' }));
      await loadProjects();
    } catch (error) {
      Alert.alert('Commentaire impossible', error instanceof Error ? error.message : 'Réessayez plus tard.');
    } finally {
      setWorking(false);
    }
  };

  const requestQuote = (project: Project) => {
    if (!requireLogin()) return;
    router.push({
      pathname: '/quotes',
      params: {
        category: artisanProfession ?? '',
        title: `Demande pour ${project.title}`,
        artisanId: project.artisan_id,
      },
    });
  };

  const requestExploit = async (project: Project) => {
    if (!requireLogin()) return;
    setWorking(true);
    try {
      const { data: created, error: quoteError } = await supabase.rpc('create_direct_quote', {
        p_artisan_id: project.artisan_id,
        p_description: `Bonjour, je souhaite demander un exploit concernant votre réalisation « ${project.title} ». ${project.description}`.slice(0, 1000),
        p_category: artisanProfession ?? 'Autre',
        p_title: 'Demande d’exploit',
      });
      if (quoteError || !created) throw quoteError ?? new Error('Impossible de créer la demande.');

      const quoteId = (created as { id: string }).id;
      const { data: chat, error: chatError } = await supabase.rpc('start_quote_chat', { p_quote_id: quoteId });
      if (chatError || !chat) throw chatError ?? new Error('Le chat n’a pas pu être ouvert.');
      const conversationId = (chat as { id: string }).id;
      const { error: messageError } = await supabase.rpc('send_chat_message', {
        p_conversation_id: conversationId,
        p_content: `Bonjour, je souhaite demander un exploit concernant votre réalisation « ${project.title} ».`,
      });
      if (messageError) throw messageError;

      Alert.alert('Demande envoyée', 'Votre demande a été transmise à l’artisan.', [
        { text: 'Voir la discussion', onPress: () => router.push({ pathname: '/messages', params: { c: conversationId } }) },
        { text: 'OK' },
      ]);
    } catch (error) {
      Alert.alert('Demande impossible', error instanceof Error ? error.message : 'Réessayez plus tard.');
    } finally {
      setWorking(false);
    }
  };

  const retryPresentation = async (projectId: string) => {
    setWorking(true);
    try {
      await api.post(`/portfolio/${projectId}/presentation`);
      await loadProjects();
      Alert.alert('PowerPoint généré', 'La présentation est prête à être ouverte.');
    } catch (error) {
      Alert.alert('Génération impossible', error instanceof Error ? error.message : 'Réessayez plus tard.');
    } finally {
      setWorking(false);
    }
  };

  const openPresentation = async (storagePath: string) => {
    const url = publicUrl(storagePath);
    try {
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert('Ouverture impossible', error instanceof Error ? error.message : 'Le PowerPoint ne peut pas être ouvert.');
    }
  };

  const deleteProject = (project: Project) => {
    if (!session?.user.id) return;
    Alert.alert('Supprimer la réalisation ?', 'Cette action supprimera aussi ses photos, ses likes et ses commentaires.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setWorking(true);
            try {
              const paths = [
                ...project.media.map((item) => item.storage_path),
                ...(project.pptx_path ? [project.pptx_path] : []),
              ];
              if (paths.length) {
                const { error: storageError } = await supabase.storage.from(BUCKET).remove(paths);
                if (storageError) throw storageError;
              }
              const { error } = await supabase.from('artisan_projects').delete().eq('id', project.id);
              if (error) throw error;
              await loadProjects();
            } catch (error) {
              Alert.alert('Suppression impossible', error instanceof Error ? error.message : 'Réessayez plus tard.');
            } finally {
              setWorking(false);
            }
          })();
        },
      },
    ]);
  };

  const titleText = canManage ? 'Mes réalisations' : 'Réalisations de l’artisan';

  if (loading) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator size="large" style={styles.center} /></SafeAreaView>;
  }

  if (managerMode && !canManage) {
    return (
      <SafeAreaView style={styles.safe}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#007AFF" />
          <Text style={styles.backText}>Retour</Text>
        </TouchableOpacity>
        <Text style={styles.empty}>Connectez-vous avec un compte artisan pour gérer vos réalisations.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadProjects();
            }}
          />
        }>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="#007AFF" />
            <Text style={styles.backText}>Retour</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.refreshButton}
            accessibilityLabel="Actualiser les réalisations"
            onPress={() => {
              setRefreshing(true);
              void loadProjects();
            }}>
            <Ionicons name="refresh" size={20} color="#007AFF" />
          </TouchableOpacity>
        </View>
        <Text style={styles.pageTitle}>{titleText}</Text>

        {canManage && (
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Publier un travail</Text>
            <Text style={styles.helpText}>Créez un PowerPoint à partir de vos photos ou importez une présentation .pptx existante.</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Titre du travail"
              maxLength={120}
              style={styles.input}
            />
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Description du travail"
              multiline
              maxLength={3000}
              style={[styles.input, styles.descriptionInput]}
            />
            <Text style={styles.counter}>{description.length}/3000</Text>
            <TouchableOpacity style={styles.secondaryButton} onPress={choosePhotos} disabled={working}>
              <Ionicons name="images-outline" size={18} color="#007AFF" />
              <Text style={styles.secondaryButtonText}>Choisir des photos ({photos.length}/{MAX_PHOTOS})</Text>
            </TouchableOpacity>
            {photos.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoStrip}>
                {photos.map((photo, index) => (
                  <View key={`${photo.uri}-${index}`} style={styles.photoWrap}>
                    <Image source={{ uri: photo.uri }} style={styles.selectedPhoto} />
                    <TouchableOpacity
                      style={styles.removePhoto}
                      accessibilityLabel="Retirer cette photo"
                      onPress={() => setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                      <Ionicons name="close-circle" size={22} color="#FF3B30" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.primaryButton} onPress={publishFromPhotos} disabled={working}>
              {working ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Publier et générer le PowerPoint</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={importPresentation} disabled={working}>
              <Ionicons name="cloud-upload-outline" size={18} color="#007AFF" />
              <Text style={styles.secondaryButtonText}>Importer un PowerPoint (.pptx)</Text>
            </TouchableOpacity>
          </View>
        )}

        {!canManage && (
          <Text style={styles.helpText}>Découvrez les travaux, aimez-les, commentez ou demandez un devis à l’artisan.</Text>
        )}

        {projects.length === 0 && <Text style={styles.empty}>Aucune réalisation publiée pour le moment.</Text>}
        {projects.map((project) => (
          <View key={project.id} style={styles.projectCard}>
            {project.status === 'draft' && <Text style={styles.draftLabel}>Brouillon non publié</Text>}
            <Text style={styles.projectTitle}>{project.title}</Text>
            <Text style={styles.projectDescription}>{project.description}</Text>
            {project.media.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaStrip}>
                {project.media.map((item) => (
                  <View key={item.id} style={styles.mediaItem}>
                    <Image source={{ uri: publicUrl(item.storage_path) }} style={styles.projectImage} />
                    {!!item.caption && <Text style={styles.caption} numberOfLines={3}>{item.caption}</Text>}
                  </View>
                ))}
              </ScrollView>
            )}
            {project.status === 'published' && <View style={styles.socialRow}>
              <TouchableOpacity style={styles.socialButton} onPress={() => void toggleLike(project)} disabled={!!busyLikes[project.id]}>
                <Ionicons name={project.liked ? 'heart' : 'heart-outline'} size={19} color={project.liked ? '#FF3B30' : '#555'} />
                <Text style={styles.socialText}>{project.like_count}</Text>
              </TouchableOpacity>
              <View style={styles.socialButton}>
                <Ionicons name="chatbubble-outline" size={18} color="#555" />
                <Text style={styles.socialText}>{project.comment_count}</Text>
              </View>
            </View>}

            {project.status === 'published' && project.comments.slice(0, 5).map((comment) => (
              <View key={comment.id} style={styles.comment}>
                <Text style={styles.commentAuthor}>{comment.author_name}</Text>
                <Text style={styles.commentBody}>{comment.body}</Text>
              </View>
            ))}

            {!canManage && project.status === 'published' && (
              <>
                <View style={styles.commentRow}>
                  <TextInput
                    value={comments[project.id] ?? ''}
                    onChangeText={(value) => setComments((current) => ({ ...current, [project.id]: value }))}
                    placeholder="Écrire un commentaire..."
                    maxLength={1000}
                    style={styles.commentInput}
                  />
                  <TouchableOpacity style={styles.sendButton} onPress={() => void submitComment(project)} disabled={working}>
                    <Ionicons name="send" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.quoteButton} onPress={() => requestQuote(project)} disabled={working}>
                  <Ionicons name="document-text-outline" size={18} color="#fff" />
                  <Text style={styles.primaryButtonText}>Demander un devis</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.exploitButton} onPress={() => void requestExploit(project)} disabled={working}>
                  <Text style={styles.exploitText}>Envoyer une demande d’exploit</Text>
                </TouchableOpacity>
              </>
            )}

            {canManage && (
              <View style={styles.manageRow}>
                {project.status === 'draft' ? (
                  <TouchableOpacity
                    style={[styles.primaryButton, styles.publishDraftButton]}
                    onPress={() => void publishDraft(project)}
                    disabled={working || project.media.length === 0}>
                    <Text style={styles.primaryButtonText}>Publier cette réalisation</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => project.pptx_path
                      ? void openPresentation(project.pptx_path)
                      : void retryPresentation(project.id)}
                    disabled={working}>
                    <Ionicons name={project.pptx_path ? 'document-outline' : 'build-outline'} size={18} color="#007AFF" />
                    <Text style={styles.secondaryButtonText}>{project.pptx_path ? 'Ouvrir le PowerPoint' : 'Générer le PowerPoint'}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.deleteButton} onPress={() => deleteProject(project)} disabled={working}>
                  <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f6f9' },
  content: { padding: 16, paddingBottom: 36, gap: 12 },
  center: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  backText: { color: '#007AFF', fontWeight: '600' },
  refreshButton: { padding: 8 },
  pageTitle: { color: '#17283f', fontSize: 26, fontWeight: '700' },
  formCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 10 },
  sectionTitle: { color: '#17283f', fontSize: 18, fontWeight: '700' },
  helpText: { color: '#68778a', fontSize: 13, lineHeight: 19 },
  input: { borderWidth: 1, borderColor: '#d8e0ea', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: '#222', backgroundColor: '#fff' },
  descriptionInput: { minHeight: 92, textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end', color: '#8793a2', fontSize: 11 },
  secondaryButton: { minHeight: 42, borderWidth: 1, borderColor: '#c9dcf5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryButtonText: { color: '#007AFF', fontWeight: '600', fontSize: 13 },
  photoStrip: { gap: 8, paddingVertical: 2 },
  photoWrap: { position: 'relative' },
  selectedPhoto: { width: 82, height: 72, borderRadius: 8, backgroundColor: '#e8edf4' },
  removePhoto: { position: 'absolute', right: -5, top: -6, backgroundColor: '#fff', borderRadius: 12 },
  primaryButton: { minHeight: 44, backgroundColor: '#007AFF', borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 11 },
  primaryButtonText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  empty: { color: '#68778a', textAlign: 'center', paddingVertical: 28, lineHeight: 20 },
  projectCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 10 },
  projectTitle: { color: '#17283f', fontSize: 17, fontWeight: '700' },
  draftLabel: { color: '#a15c00', fontSize: 12, fontWeight: '700' },
  projectDescription: { color: '#475569', fontSize: 14, lineHeight: 20 },
  mediaStrip: { gap: 10 },
  mediaItem: { width: 230, gap: 5 },
  projectImage: { width: 230, height: 160, borderRadius: 10, backgroundColor: '#e8edf4' },
  caption: { color: '#68778a', fontSize: 12, lineHeight: 16 },
  socialRow: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingVertical: 2 },
  socialButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  socialText: { color: '#555', fontSize: 13, fontWeight: '600' },
  comment: { borderLeftWidth: 2, borderLeftColor: '#dbe6f5', paddingLeft: 9, gap: 2 },
  commentAuthor: { color: '#34445a', fontSize: 12, fontWeight: '700' },
  commentBody: { color: '#555', fontSize: 13, lineHeight: 18 },
  commentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentInput: { flex: 1, borderWidth: 1, borderColor: '#d8e0ea', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, color: '#222' },
  sendButton: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#007AFF', alignItems: 'center', justifyContent: 'center' },
  quoteButton: { minHeight: 42, backgroundColor: '#007AFF', borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  exploitButton: { paddingVertical: 8, alignItems: 'center' },
  exploitText: { color: '#FF6B00', fontWeight: '600' },
  manageRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  publishDraftButton: { flex: 1 },
  deleteButton: { minHeight: 42, width: 44, borderWidth: 1, borderColor: '#f4c8c8', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
