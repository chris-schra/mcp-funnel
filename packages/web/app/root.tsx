import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import type { LinksFunction } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import stylesheet from './tailwind.css?url';

export const links: LinksFunction = () => [
  { rel: 'stylesheet', href: stylesheet },
];

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
});

/**
 * Root layout component wrapping the entire application.
 *
 * Provides the HTML document structure, meta tags, stylesheets, and global
 * providers including React Query for data fetching. The QueryClient is
 * configured with 1-minute stale time and single retry for failed requests.
 *
 * @param children - Child components to render in the layout
 * @returns React component rendering the HTML document structure
 *
 * @public
 */
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          {children}
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

/**
 * Main application component for React Router.
 *
 * Renders the routed page content via Outlet. This is the root of the
 * application's routing tree.
 *
 * @returns React component rendering the routed page
 *
 * @public
 */
export default function App() {
  return <Outlet />;
}
