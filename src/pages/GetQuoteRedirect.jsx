import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

// Get a quote lives on the upgrade page (QuoteBuilder), which reads the live
// catalogue and is priced server side by generate-quote. The old
// configurator at /dashboard/get-quote read an empty module list and could
// not produce a quote (deleted in design batch 7B), so both /dashboard/get-quote
// and the old public /get-quote promo share links land here. The query
// string and router state are passed through unchanged.
export default function GetQuoteRedirect() {
  const location = useLocation();
  return (
    <Navigate
      to={{ pathname: '/dashboard/upgrade', search: location.search }}
      state={location.state}
      replace
    />
  );
}
