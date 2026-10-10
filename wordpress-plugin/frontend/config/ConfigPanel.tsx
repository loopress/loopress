import { useQueries, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api';
import { Pill, ResourceSection, Row, Table } from '../ui';
import { CELL, MONO, MUTED } from '../helpers';

// Mirrors the plugin's list endpoints (AcfService::list(), MenuService::exportMenu(),
// PostTypeService::registered(), TaxonomyService::registered(),
// WPFormsProvider::toCanonical(), RankMathService::exportRedirection()), only the fields shown.
interface AcfObject {
    key: string;
    title?: string;
}

interface Menu {
    slug: string;
    name: string;
    items: unknown[];
}

interface RegisteredPostType {
    slug: string;
    label: string;
    source: 'loopress' | 'wordpress' | 'acf' | 'cptui' | 'other';
    count: number;
    managed: boolean;
    conflict: boolean;
}

// `count` is the number of terms here, published posts for a post type.
interface RegisteredTaxonomy extends RegisteredPostType {
    objectTypes: string[];
}

const SOURCE_LABELS: Record<RegisteredPostType['source'], string> = {
    loopress: 'Loopress',
    wordpress: 'WordPress',
    acf: 'ACF',
    cptui: 'CPT UI',
    other: 'Theme or plugin',
};

interface Form {
    id: number;
    settings?: { form_title?: string };
}

interface Redirect {
    id: number;
    sources: { pattern?: string }[] | string;
    urlTo: string;
    headerCode: number;
}

const ACF_TYPES = [
    { route: 'field-groups', label: 'Field group' },
    { route: 'post-types', label: 'Post type' },
    { route: 'taxonomies', label: 'Taxonomy' },
    { route: 'options-pages', label: 'Options page' },
];

// The error the endpoint itself gives ("ACF is not active", "No supported SEO plugin is
// active"...) says more than a generic failure.
function errorText(error: Error | null, fallback: string): string {
    return error?.message || fallback;
}

function sourcesOf(redirect: Redirect): string {
    if (typeof redirect.sources === 'string') return redirect.sources;
    return redirect.sources.map((source) => source.pattern ?? '').filter(Boolean).join(', ');
}

function Pull({ command }: Readonly<{ command: string }>) {
    return <>Pulled into your repository with <code>{command}</code>.</>;
}

function AcfSection() {
    const results = useQueries({
        queries: ACF_TYPES.map(({ route }) => ({
            queryKey: ['acf', route],
            queryFn: () => apiFetch<AcfObject[]>(`/acf/${route}`),
            staleTime: 30_000,
        })),
    });
    const rows = results.flatMap((result, i) => (result.data ?? []).map((object) => ({ ...object, type: ACF_TYPES[i].label })));
    const failed = results.find((result) => result.isError);

    return (
        <ResourceSection
            title="ACF"
            description={<Pull command="lps acf pull" />}
            query={{
                isPending: results.some((result) => result.isPending),
                isFetching: results.some((result) => result.isFetching),
                isError: Boolean(failed),
            }}
            isEmpty={rows.length === 0}
            errorText={errorText(failed?.error ?? null, 'Failed to load ACF objects.')}
            empty="No field groups, post types, taxonomies or options pages yet."
        >
            <Table columns={['Name', 'Type', 'Key']}>
                {rows.map((object) => (
                    <Row key={object.key}>
                        <td style={CELL}><strong>{object.title || object.key}</strong></td>
                        <td style={CELL}>{object.type}</td>
                        <td style={MONO}>{object.key}</td>
                    </Row>
                ))}
            </Table>
        </ResourceSection>
    );
}

function MenusSection() {
    const query = useQuery<Menu[]>({ queryKey: ['menus'], queryFn: () => apiFetch<Menu[]>('/menus'), staleTime: 30_000 });
    const menus = query.data ?? [];

    return (
        <ResourceSection
            title="Menus"
            description={<Pull command="lps menu pull" />}
            query={query}
            isEmpty={menus.length === 0}
            errorText={errorText(query.error, 'Failed to load menus.')}
            empty="No menus yet."
        >
            <Table columns={['Menu', 'Slug', 'Top-level items']}>
                {menus.map((menu) => (
                    <Row key={menu.slug}>
                        <td style={CELL}><strong>{menu.name}</strong></td>
                        <td style={MONO}>{menu.slug}</td>
                        <td style={CELL}>{menu.items.length}</td>
                    </Row>
                ))}
            </Table>
        </ResourceSection>
    );
}

// Every post type on the site, not only Loopress's, so a site can be reviewed before moving its
// post types into cpt/ files.
function PostTypesSection() {
    const query = useQuery<RegisteredPostType[]>({
        queryKey: ['registered-post-types'],
        queryFn: () => apiFetch<RegisteredPostType[]>('/registered-post-types'),
        staleTime: 30_000,
    });
    const postTypes = query.data ?? [];

    return (
        <ResourceSection
            title="Post types"
            description={<>Loopress post types are declared in <code>cpt/</code> files and pulled with <code>lps cpt pull</code>.</>}
            query={query}
            isEmpty={postTypes.length === 0}
            errorText={errorText(query.error, 'Failed to load post types.')}
            empty="No post types."
        >
            <Table columns={['Name', 'Slug', 'Source', 'Published']}>
                {postTypes.map((postType) => (
                    <Row key={postType.slug}>
                        <td style={CELL}><strong>{postType.label}</strong></td>
                        <td style={MONO}>{postType.slug}</td>
                        <td style={CELL}>
                            {SOURCE_LABELS[postType.source]}
                            {postType.conflict && (
                                <Pill tone="warning" title="Declared in cpt/, but this slug was already registered first: the Loopress version is skipped.">
                                    Conflict
                                </Pill>
                            )}
                        </td>
                        <td style={CELL}>{postType.count}</td>
                    </Row>
                ))}
            </Table>
        </ResourceSection>
    );
}

// Same as PostTypesSection: every taxonomy on the site, only its structure, never its terms.
function TaxonomiesSection() {
    const query = useQuery<RegisteredTaxonomy[]>({
        queryKey: ['registered-taxonomies'],
        queryFn: () => apiFetch<RegisteredTaxonomy[]>('/registered-taxonomies'),
        staleTime: 30_000,
    });
    const taxonomies = query.data ?? [];

    return (
        <ResourceSection
            title="Taxonomies"
            description={<>Loopress taxonomies are declared in <code>taxonomies/</code> files and pulled with <code>lps taxonomy pull</code>. Their terms are never synced.</>}
            query={query}
            isEmpty={taxonomies.length === 0}
            errorText={errorText(query.error, 'Failed to load taxonomies.')}
            empty="No taxonomies."
        >
            <Table columns={['Name', 'Slug', 'Source', 'Attached to', 'Terms']}>
                {taxonomies.map((taxonomy) => (
                    <Row key={taxonomy.slug}>
                        <td style={CELL}><strong>{taxonomy.label}</strong></td>
                        <td style={MONO}>{taxonomy.slug}</td>
                        <td style={CELL}>
                            {SOURCE_LABELS[taxonomy.source]}
                            {taxonomy.conflict && (
                                <Pill tone="warning" title="Declared in taxonomies/, but this slug was already registered first: the Loopress version is skipped.">
                                    Conflict
                                </Pill>
                            )}
                        </td>
                        <td style={MONO}>{taxonomy.objectTypes.join(', ')}</td>
                        <td style={CELL}>{taxonomy.count}</td>
                    </Row>
                ))}
            </Table>
        </ResourceSection>
    );
}

function FormsSection() {
    const query = useQuery<Form[]>({ queryKey: ['forms'], queryFn: () => apiFetch<Form[]>('/forms'), staleTime: 30_000 });
    const forms = query.data ?? [];

    return (
        <ResourceSection
            title="Forms"
            description={<Pull command="lps form pull" />}
            query={query}
            isEmpty={forms.length === 0}
            errorText={errorText(query.error, 'Failed to load forms.')}
            empty="No forms yet."
        >
            <Table columns={['Form', 'ID']}>
                {forms.map((form) => (
                    <Row key={form.id}>
                        <td style={CELL}><strong>{form.settings?.form_title || `Form ${form.id}`}</strong></td>
                        <td style={MONO}>{form.id}</td>
                    </Row>
                ))}
            </Table>
        </ResourceSection>
    );
}

function RedirectsSection() {
    const query = useQuery<Redirect[]>({ queryKey: ['seo-redirects'], queryFn: () => apiFetch<Redirect[]>('/seo/redirects'), staleTime: 30_000 });
    const redirects = query.data ?? [];

    return (
        <ResourceSection
            title="SEO redirects"
            description={<>SEO settings and redirects are pulled with <code>lps seo pull</code>.</>}
            query={query}
            isEmpty={redirects.length === 0}
            errorText={errorText(query.error, 'Failed to load redirects.')}
            empty="No redirects yet."
        >
            <Table columns={['From', 'To', 'Code']}>
                {redirects.map((redirect) => (
                    <Row key={redirect.id}>
                        <td style={MONO}>{sourcesOf(redirect)}</td>
                        <td style={MONO}>{redirect.urlTo}</td>
                        <td style={CELL}>{redirect.headerCode}</td>
                    </Row>
                ))}
            </Table>
        </ResourceSection>
    );
}

// The configuration Loopress syncs (Loopress Light's whole scope), next to the Code tab's
// deployed code (Full only): the same split as the two editions. Read-only, like Code.
export function ConfigPanel() {
    return (
        <>
            <p style={{ color: MUTED, fontSize: 13, marginTop: 0 }}>
                Configuration stored in WordPress and synced with the Loopress CLI, listed read-only.
            </p>
            <AcfSection />
            <MenusSection />
            <PostTypesSection />
            <TaxonomiesSection />
            <FormsSection />
            <RedirectsSection />
        </>
    );
}
