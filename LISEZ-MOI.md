# Collecteur de veille — guide d'installation

Outil web pour les étudiants : ils choisissent un type de veille dans une liste, collent une adresse, et obtiennent un tableau exportable dans Excel.

| Type de veille | Ce que l'outil relève |
|---|---|
| Offre d'un concurrent | Produits d'une page rayon : prix, prix barré, remise, disponibilité ; prix moyen, médian, mini, maxi |
| Fiche produit | Prix, prix barré, remise, marque, disponibilité, note, nombre d'avis, référence |
| Promotions | Produits remisés, taux de remise, bandeaux et codes promo affichés |
| Avis clients d'un site marchand | Note, nombre d'avis, avis publiés sur la fiche produit, répartition des étoiles |
| Avis clients Google | Note Google, nombre d'avis, 5 derniers avis (par l'API officielle de Google) |
| Contenu d'un site | Titres de la page, derniers articles, flux RSS éventuel |

Mise en ligne sur Netlify : environ 20 minutes, sans écrire de code. Tout est gratuit, sauf la clé Google (facultative, voir étape 4).

---

## Étape 1 — Créer un compte GitHub (le « classeur » qui stocke les fichiers)

1. Allez sur https://github.com et cliquez sur **Sign up**. Créez un compte avec votre adresse mail.
2. Une fois connecté, cliquez sur le **+** en haut à droite, puis **New repository**.
3. Nom : `collecteur-veille`. Laissez **Public** ou choisissez **Private**. Cliquez sur **Create repository**.
4. Sur la page suivante, cliquez sur le lien **uploading an existing file**.
5. Décompressez l'archive reçue sur votre ordinateur. Ouvrez le dossier `outil-veille-scraping`, sélectionnez **tout son contenu** (les fichiers et les dossiers `api`, `lib`, `netlify`, `test`) et glissez-le dans la fenêtre GitHub.
6. Attendez la fin du téléchargement, puis cliquez sur **Commit changes** en bas de page.

Vérification : la page du dépôt doit afficher `index.html`, `package.json`, `netlify.toml` et les dossiers `api` et `lib` directement à la racine (pas à l'intérieur d'un sous-dossier).

## Étape 2 — Mettre l'outil en ligne avec Netlify

Attention : le simple glisser-déposer (Netlify Drop) que vous avez peut-être utilisé pour un site classique ne suffit pas ici. Cet outil contient une partie « serveur » qui va lire les pages web, et Netlify ne la met en route que si le site est relié à GitHub.

1. Allez sur https://app.netlify.com et connectez-vous (le compte déjà utilisé convient). Si besoin, reliez-le à GitHub : **User settings > Applications > GitHub**.
2. Cliquez sur **Add new site > Import an existing project**, puis sur **GitHub**. Autorisez Netlify si la fenêtre le demande.
3. Choisissez le dépôt `collecteur-veille`.
4. Sur l'écran de réglages, ne modifiez rien : le fichier `netlify.toml` fourni remplit déjà les cases.
5. Cliquez sur **Add environment variables** et ajoutez :
   - Key : `ACCESS_CODE` — Value : un code de classe de votre choix (par exemple `MCO2026`).
6. Cliquez sur **Deploy**. Après une à deux minutes, Netlify affiche une adresse du type `https://nom-au-hasard.netlify.app`. Vous pouvez la renommer : **Site configuration > Change site name** (par exemple `collecteur-veille-mco`).

C'est cette adresse que vous donnez aux étudiants, avec le code de classe. Le code évite que n'importe qui sur Internet utilise votre outil.

(Vercel fonctionne aussi : importez le même dépôt sur https://vercel.com et ajoutez la même variable `ACCESS_CODE`.)

## Étape 3 — Tester

Ouvrez l'adresse, saisissez le code de classe, choisissez « Contenu d'un site » et collez l'adresse d'un site d'actualité du commerce. Un tableau doit apparaître.

Faites ensuite un essai avec chaque type de veille sur les sites que vous comptez utiliser en cours : c'est la seule manière de savoir quels sites se laissent lire (voir « Limites » plus bas).

## Étape 4 (facultative) — Activer les avis Google

Google interdit la collecte directe sur Google Maps. L'outil passe donc par l'API officielle Google Places, qui demande une clé.

1. Allez sur https://console.cloud.google.com et connectez-vous avec un compte Google.
2. Créez un projet (menu en haut à gauche > **Nouveau projet**), nommé par exemple `collecteur-veille`.
3. Google exige un compte de facturation (carte bancaire). Le palier gratuit couvre 1 000 recherches par mois avec avis, ce qui suffit largement pour une classe.
4. Dans la barre de recherche de la console, tapez **Places API (New)** et cliquez sur **Activer**.
5. Menu **API et services > Identifiants > Créer des identifiants > Clé API**. Copiez la clé.
6. Cliquez sur la clé, puis **Restrictions relatives aux API** > **Restreindre la clé** > cochez uniquement **Places API (New)** > **Enregistrer**.
7. Par sécurité, plafonnez l'usage : **API et services > Places API (New) > Quotas**, et fixez par exemple 50 requêtes par jour. Vous ne pourrez alors jamais dépasser le palier gratuit.
8. Dans Netlify : votre site > **Site configuration > Environment variables > Add a variable** > `GOOGLE_PLACES_API_KEY` avec la clé copiée. Puis onglet **Deploys > Trigger deploy > Deploy site**.

Tant que cette clé n'est pas ajoutée, l'option « Avis clients Google » apparaît grisée avec la mention « non activé ».

## Modifier l'outil plus tard

Pour changer un fichier : ouvrez-le sur GitHub, cliquez sur l'icône crayon, modifiez, puis **Commit changes**. Netlify remet l'outil à jour tout seul en une à deux minutes.

Pour changer le code de classe : Netlify > **Site configuration > Environment variables** > modifiez `ACCESS_CODE`, puis **Deploys > Trigger deploy > Deploy site**.

---

## Limites à connaître (et à expliquer aux étudiants)

- **Sites qui bloquent les robots.** Les grandes plateformes (Amazon, Cdiscount, Fnac, Leboncoin…) détectent et bloquent les programmes de collecte. L'outil affiche alors un message clair. Les sites d'enseignes moyennes, de PME et de commerces indépendants se lisent généralement bien.
- **Pages « dynamiques ».** Certains sites n'affichent leurs produits ou leurs avis qu'après exécution d'un script dans le navigateur. L'outil ne voit alors pas ces informations.
- **robots.txt respecté.** Quand un site interdit la collecte automatique dans son fichier robots.txt, l'outil s'arrête et le signale. C'est le cas de Trustpilot, qui interdit toute collecte automatique : ses avis doivent être consultés et relevés à la main.
- **Extraction automatique.** Sur une page rayon, l'outil repère les blocs qui contiennent un nom, un lien et un prix. Il peut se tromper (prix d'une option, prix au kilo). Demandez aux étudiants de vérifier quelques lignes sur le site.
- **Avis Google.** L'API ne fournit que 5 avis, choisis par Google comme « les plus pertinents ». La note globale et le nombre total d'avis sont, eux, complets.
- **Durée.** Une collecte s'arrête au bout de quelques secondes si le site est trop lent (limite des hébergeurs gratuits). Il suffit alors de relancer.
- **Volume.** 40 recherches par poste toutes les 10 minutes au maximum.

## Cadre légal (rappel)

- Les noms des auteurs d'avis sont des données personnelles (RGPD) : l'outil les réduit aux initiales. Les travaux étudiants ne doivent pas republier d'avis nominatifs.
- Les conditions générales de certains sites interdisent la collecte automatique, même quand le robots.txt ne la bloque pas. L'outil est conçu pour des relevés ponctuels et de faible volume dans un cadre pédagogique.

## Utilisation sur un ordinateur (sans hébergeur)

Si Node.js est installé : ouvrez un terminal dans le dossier, tapez `npm install` puis `npm start`, et ouvrez http://localhost:3000.

## Organisation des fichiers

```
index.html        page vue par les étudiants
api/scrape.js     point d'entrée du serveur (code de classe, limite d'usage)
netlify/          branchement pour Netlify (netlify.toml à la racine)
lib/scrape.js     aiguillage selon le type de veille, calcul des indicateurs
lib/parsers.js    lecture des pages (prix, produits, promotions, avis, contenus)
lib/fetcher.js    téléchargement des pages, contrôle robots.txt, sécurité
lib/google.js     avis Google via l'API officielle
server.js         serveur pour un usage local
test/             pages d'essai et tests (npm test)
```
