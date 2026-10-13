import { AppsDiagnosticsBanner } from '../apps/AppsDiagnosticsBanner';
import { AuditBanner } from '../dependencies/AuditBanner';
import { DiagnosticsBanner } from '../dependencies/DiagnosticsBanner';
import { ConflictsBanner } from './ConflictsBanner';
import { LoadErrorsBanner } from './LoadErrorsBanner';

// Every warning the Full edition's tabs raise, repeated at the top of Overview so none waits
// for its tab to be opened. Kept out of Overview itself: the Light bundle has none of these
// endpoints and must not pull in the Composer UI.
export function FullIssues() {
    return (
        <>
            <LoadErrorsBanner />
            <AuditBanner />
            <AppsDiagnosticsBanner />
            <DiagnosticsBanner />
            <ConflictsBanner />
        </>
    );
}
