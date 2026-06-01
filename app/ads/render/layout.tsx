// Nested layout for the ad render route.
// Cannot redeclare <html>/<body> — those belong to the root layout.
// The page itself injects a <style> reset to hide root chrome for screenshots.
export default function AdRenderLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
