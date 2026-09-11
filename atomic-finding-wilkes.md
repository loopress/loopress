# Résumé : e2e tests WIP + provisioning CI plugins

## Contexte
Branche `e2e-tests-improvement` (repo `loopress`) contient 2 specs e2e WIP ajoutées au dernier commit ("wip on e2e tests") : `e2e/form-sync.spec.ts` et `e2e/project-rotate.spec.ts`. Objectif : les remettre au niveau des dernières évolutions du code.

## Fait et vérifié

- **`e2e/project-rotate.spec.ts`** : vérifié ligne par ligne contre `cli/src/commands/project/rotate.ts`, `cli/src/lib/rotate-app-password.ts`, `cli/src/config/project-config.manager.ts`. Tout est cohérent, **aucun changement nécessaire**.

- **`e2e/form-sync.spec.ts`** : bug trouvé et **corrigé (non commit)** — le describe block `'no active form plugin'` utilisait encore l'ancien pattern `setPluginActive(page, wp, slug, active)` avec `browser.newPage()` + `loginToWpAdmin`. Le helper a été migré vers `setPluginActive(requestUtils, slug, active)` (REST direct, sans login UI), comme le montrent déjà `acf-sync.spec.ts` et `seo-sync.spec.ts`. Fix appliqué : import `loginToWpAdmin` retiré, `beforeAll`/`afterAll` utilisent `requestUtils`. Typechecké OK (`tsc --noEmit`).
  - **Statut actuel** : modifié sur disque, **pas encore commit** (`git status` : `M e2e/form-sync.spec.ts`).

## Problème découvert (bloquant pour form-sync.spec.ts)

Le repo séparé `loopress/setup-ci` (clone local : `/Users/maximeblanc/Localdev/loopress-monorepo/setup-ci`, remote `git@github.com:loopress/setup-ci.git`, branche `main`) provisionne le WordPress jetable utilisé par toute la suite e2e (`scripts/setup-wordpress.sh`). Il installe/active WPCode, Code Snippets (inactif exprès), ACF, RankMath, Yoast — **mais jamais WPForms**. Sans ça, `form-sync.spec.ts` échoue forcément (le plugin n'existe pas sur l'instance).

## Décision prise avec l'utilisateur

Ne pas juste ajouter une 7e ligne `wp plugin install wpforms-lite --activate` (j'avais fait ce commit sur une branche locale `feat/install-wpforms`, **supprimée depuis, jamais pushée**). L'utilisateur veut que `setup-ci` arrête d'embarquer des plugins métier en dur, et que ce soit géré de façon agnostique via `loopress.json` (ou composer).

## Recherche faite sur les options

1. **`loopress.json` + `lps plugin push`** (déjà livré, `cli/src/commands/plugin/push.ts`) : lit le champ `plugins` de `loopress.json`, diff contre `wp/v2/plugins` (API core WP), installe+active ce qui manque. C'est LE mécanisme agnostique déjà existant.
   - Limite A : installe toujours actif (`status: 'active'`), impossible d'installer sans activer → **Code Snippets doit rester à part** (doit rester inactif pour le test de conflit).
   - Limite B : le plugin Loopress lui-même (zip GitHub, pas un slug wp.org) est explicitement exclu de cette gestion → **reste un cas à part, doit rester dans setup-ci** (c'est la raison d'être de l'outil).

2. **Composer** (`lps composer push`, `wpackagist-plugin/*` dans composer.json) : mécanisme réel et déjà livré en général, MAIS `e2e/composer-sync.spec.ts` documente un bug déjà tracké : collision d'autoload PHP entre le Composer interne de Loopress et la version embarquée (obsolète) de `composer/installers` de Yoast, **dès que Yoast est actif**. Or Yoast doit être actif sur cette instance e2e partagée. → **Composer n'est pas viable ici pour l'instant**, à écarter pour ce cas précis (mais la mémoire projet qui disait "composer plugins = pas construit" était fausse pour les dépendances Packagist classiques, juste vraie pour "plugins WP via composer sur cette instance précise").

3. `.github/workflows/ci.yml` (job `cli-e2e`) : appelle `loopress/setup-ci@<sha figé>`, puis écrase le plugin loopress-full par le build de la branche, extrait le mot de passe applicatif, lance `pnpm test:e2e`. C'est ici (ou dans un script equivalent pour l'usage local documenté dans `e2e/README.md`) qu'il faudrait ajouter une étape "provisionner les plugins de test" (fixture `loopress.json` + `lps plugin push`, puis install à part de `code-snippets` sans activation, puis le `wp eval` RankMath spécifique déplacé depuis setup-ci).

## Où j'en étais / prochaine étape

J'avais lancé un agent "Plan" pour figer un plan détaillé (fichiers exacts à modifier dans les 2 repos, ordre de rollout entre `setup-ci` et `loopress` vu qu'ils sont versionnés indépendamment). **Interrompu par l'utilisateur avant résultat** (plus urgent ailleurs).

### À reprendre :
1. Décider : on committe le fix `form-sync.spec.ts` (déjà fait, safe, indépendant du reste) tout de suite ?
2. Reprendre le plan détaillé pour le refactor "provisioning agnostique" (2 repos : `setup-ci` à alléger, `loopress` à qui revient la responsabilité des plugins spécifiques aux tests).
3. Vérifier `gitlab/template.yml` et `circleci/orb.yml` dans `setup-ci` (pas encore lus) au cas où ils référencent aussi ces plugins.
4. Vérifier `restore-wordpress.sh` (pas encore lu en détail) — dépend juste du snapshot DB pris en fin de `setup-wordpress.sh`, donc impact probablement nul si le contenu du snapshot change juste de "quoi provisionne où".
