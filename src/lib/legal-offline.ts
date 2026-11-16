type LegalSlug = 'privacy' | 'terms';

const CONTACT_EMAIL = 'Togethertechsupport@gmail.com';

const documentHtml = (title: string, sections: { title: string; html: string }[]) => `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — ARTISANTS</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; color: #101828; background: #f3f5f8; font: 15px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { max-width: 760px; margin: 0 auto; padding: 22px; background: #fff; border-radius: 16px; }
    h1 { margin: 0 0 8px; font-size: 25px; line-height: 1.25; }
    .updated { margin: 0 0 24px; color: #667085; font-size: 12px; }
    section { padding: 0 0 18px; margin: 0 0 18px; border-bottom: 1px solid #e4e7ec; }
    section:last-child { padding: 0; margin: 0; border: 0; }
    h2 { margin: 0 0 8px; color: #1877f2; font-size: 17px; }
    p { margin: 0 0 9px; }
    ul { margin: 0 0 9px; padding-left: 22px; }
    li { margin-bottom: 5px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px; border: 1px solid #e4e7ec; text-align: left; vertical-align: top; }
    a { color: #1877f2; }
    .contact { color: #475467; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p class="updated">Copie hors ligne — dernière mise à jour connue : 3 novembre 2026</p>
    ${sections.map((section) => `<section><h2>${section.title}</h2>${section.html}</section>`).join('')}
    <p class="contact">Une question ? <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
  </main>
</body>
</html>`;

const privacyDocument = documentHtml('Politique de confidentialité', [
  {
    title: 'Responsable du traitement',
    html: `<p>Cette politique décrit la manière dont ARTISANTS, édité par Guellord, collecte et protège vos données lorsque vous utilisez l’application. Pour toute question : <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>`,
  },
  {
    title: 'Données collectées',
    html: `<table>
      <tr><th>Catégorie</th><th>Exemples</th><th>Source</th></tr>
      <tr><td>Compte</td><td>Nom, adresse e-mail et rôle (client ou artisan)</td><td>Vous</td></tr>
      <tr><td>Profil</td><td>Téléphone, adresse, ville, métier, disponibilité et photo</td><td>Vous</td></tr>
      <tr><td>Localisation</td><td>Position GPS utilisée pour les artisans proches et l’affectation des devis</td><td>Votre appareil, avec votre autorisation</td></tr>
      <tr><td>Activité</td><td>Demandes de devis, statuts et messages</td><td>Vous</td></tr>
      <tr><td>Données techniques</td><td>Appareil, version de l’application, journaux d’erreurs et adresse IP</td><td>Automatique</td></tr>
    </table><p>Aucune carte bancaire ni donnée de paiement n’est traitée dans l’application.</p>`,
  },
  {
    title: 'Utilisation et partage',
    html: `<p>Les données servent à fournir le service, rapprocher clients et artisans, traiter les devis, sécuriser la plateforme et respecter les obligations légales. La localisation repose sur votre consentement et peut être désactivée dans les réglages de l’appareil.</p>
      <p>Nous ne vendons pas vos données. Elles sont partagées uniquement avec les utilisateurs concernés par une mise en relation, les prestataires techniques (Supabase, Brevo, Render et OpenStreetMap) et les autorités lorsque la loi l’exige. Un traitement hors de votre pays peut avoir lieu avec des garanties appropriées.</p>`,
  },
  {
    title: 'Conservation et droits',
    html: `<ul>
      <li>Les données du compte sont conservées pendant son activité, puis supprimées ou anonymisées après sa fermeture, sous réserve des obligations légales.</li>
      <li>La position est conservée pour afficher la position actuelle et remplacée lors de sa mise à jour.</li>
      <li>Les journaux techniques sont conservés au maximum 12 mois.</li>
    </ul>
    <p>Selon votre lieu de résidence, vous pouvez demander l’accès, la rectification, l’effacement, la limitation, l’opposition ou la portabilité de vos données, et retirer votre consentement. Écrivez à <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. Une demande de suppression de compte doit être vérifiée et peut être soumise depuis le Centre d’aide.</p>`,
  },
  {
    title: 'Sécurité et autorisations',
    html: `<p>Nous utilisons HTTPS/TLS, des règles d’accès par rôle, une limitation des requêtes et des journaux de sécurité. L’application peut demander l’accès à la localisation pour ses fonctions de carte. Elle n’accède pas à vos contacts, à votre microphone ni à vos SMS.</p>`,
  },
  {
    title: 'Cookies, mineurs et modifications',
    html: `<p>L’application mobile n’utilise pas de cookies publicitaires. ARTISANTS s’adresse aux personnes âgées de 16 ans ou plus. Cette politique peut être mise à jour ; les changements importants seront signalés dans l’application ou par e-mail.</p>`,
  },
]);

const termsDocument = documentHtml('Conditions d’utilisation', [
  {
    title: 'Acceptation et service',
    html: `<p>En créant un compte ou en utilisant ARTISANTS, vous acceptez ces conditions et la politique de confidentialité. ARTISANTS met en relation des clients et des artisans au moyen de la recherche, des demandes de devis et d’outils de communication.</p>
      <p>ARTISANTS agit comme intermédiaire technique : il n’est pas partie au contrat conclu entre le client et l’artisan et ne réalise pas lui-même les prestations.</p>`,
  },
  {
    title: 'Comptes et éligibilité',
    html: `<ul>
      <li>Vous devez avoir au moins 16 ans et être en mesure de contracter.</li>
      <li>Les informations fournies doivent être exactes et tenues à jour.</li>
      <li>Vous êtes responsable de la confidentialité de vos identifiants et de l’activité de votre compte.</li>
      <li>Votre compte est personnel et ne peut pas être cédé.</li>
    </ul>`,
  },
  {
    title: 'Obligations des utilisateurs',
    html: `<p>Les clients doivent décrire leur besoin avec exactitude et traiter les artisans avec respect. Les artisans doivent disposer des qualifications, assurances et autorisations exigées et fournir des devis honnêtes et des prestations professionnelles, conformément à la loi.</p>`,
  },
  {
    title: 'Devis et paiements',
    html: `<p>Les devis sont établis par les artisans et deviennent contractuels après acceptation par le client. Le prix, les délais et le paiement sont convenus entre eux. ARTISANTS n’encaisse pas les paiements et ne garantit pas la qualité des prestations.</p>`,
  },
  {
    title: 'Comportements interdits',
    html: `<ul>
      <li>Publier des informations fausses, trompeuses ou illicites, ou usurper l’identité d’autrui.</li>
      <li>Harceler, menacer ou discriminer un autre utilisateur.</li>
      <li>Contourner la sécurité, accéder sans autorisation aux systèmes ou extraire des données de manière automatisée.</li>
      <li>Utiliser le service à des fins frauduleuses ou contraires à la loi.</li>
    </ul>`,
  },
  {
    title: 'Contenus et disponibilité',
    html: `<p>La marque, le logo, l’application et leur contenu sont protégés. Vous conservez vos droits sur les contenus publiés et autorisez leur affichage dans le cadre du service. Nous nous efforçons d’assurer la continuité du service, sans garantir l’absence d’interruptions ; des fonctionnalités peuvent évoluer, être suspendues ou arrêtées.</p>`,
  },
  {
    title: 'Responsabilité et résiliation',
    html: `<p>Dans les limites permises par la loi, ARTISANTS et son éditeur ne sont pas responsables des dommages indirects, de la perte de profits ou de données, ni des litiges entre utilisateurs ou des défauts d’exécution d’une prestation. Aucune responsabilité qui ne peut être exclue légalement ne l’est par ces conditions.</p>
      <p>Vous pouvez demander la fermeture de votre compte à tout moment. Un compte peut être suspendu ou supprimé en cas de fraude, de violation des conditions ou d’obligation légale.</p>`,
  },
  {
    title: 'Données et droit applicable',
    html: `<p>Le traitement de vos données est décrit dans la politique de confidentialité. Ces conditions sont régies par le droit applicable au lieu d’établissement de l’éditeur, sans préjudice des règles impératives de protection des consommateurs de votre pays. Pour toute question ou réclamation : <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
      <p>Les conditions peuvent être modifiées. Les changements importants seront notifiés ; la poursuite de l’utilisation après leur entrée en vigueur vaut acceptation.</p>`,
  },
]);

export const getOfflineLegalHtml = (slug: LegalSlug): string =>
  slug === 'privacy' ? privacyDocument : termsDocument;
