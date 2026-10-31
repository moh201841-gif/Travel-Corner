/**
 * Travel Corner application router — Atlas Journal editorial system.
 * Language-prefixed routes keep English LTR and Arabic RTL content structurally distinct while sharing the same design language.
 */
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { applyDocumentLanguage, languageFromPath } from "./lib/language";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import { TravelAdminPage } from "./pages/TravelAdmin";
import { OfficialOfferDetailPage, OfficialOffersPage, UmrahProgramDetailPage, UmrahProgramsPage } from "./pages/OfficialOffers";
import { DestinationsPage, PlanTripPage, StandardPage } from "./pages/TravelPages";
function Router() {
  const [location] = useLocation();

  // Keep the document language and reading direction in step with the active route. Applied here
  // rather than in TravelLayout so routes outside the public shell (/admin, unmatched routes) also
  // reset correctly instead of inheriting a stale Arabic document language.
  useEffect(() => {
    applyDocumentLanguage(languageFromPath(location));
  }, [location]);

  // make sure to consider if you need authentication for certain routes
  return <Switch>
    <Route path="/admin" component={TravelAdminPage} />
    <Route path="/" component={() => <Home lang="en" />} />
    <Route path="/en" component={() => <Home lang="en" />} />
    <Route path="/ar" component={() => <Home lang="ar" />} />
    <Route path="/:lang/packages/:slug" component={OfficialOfferDetailPage} />
    <Route path="/:lang/packages" component={OfficialOffersPage} />
    <Route path="/:lang/umrah/:slug" component={UmrahProgramDetailPage} />
    <Route path="/:lang/umrah" component={UmrahProgramsPage} />
    <Route path="/:lang/destinations" component={DestinationsPage} />
    <Route path="/:lang/plan-your-trip" component={PlanTripPage} />
    <Route path="/:lang/:page" component={StandardPage} />
    <Route component={() => <Home lang="en" />} />
  </Switch>;
}

function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster position="top-center" richColors /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}

export default App;
