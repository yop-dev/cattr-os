<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" href="/favicon.ico">
    <link rel="preconnect" href="/api">
    <link rel="preconnect" href="https://fonts.gstatic.com">
    <x:sri.link mix href="/dist/app.css" rel="stylesheet" />
    <title>Cattr</title>
    <style>
        /* BUG-006: prevent action buttons from wrapping to a second line in grid list pages */
        .crud__table .at-table .actions-column .actions__wrapper {
            flex-wrap: nowrap !important;
            align-items: center;
        }
    </style>
</head>
<body>
<noscript>
    <strong>We're sorry but Cattr doesn't work properly without JavaScript enabled. Please enable it to continue.</strong>
</noscript>
<div id="app"></div>
<x:sri.script mix src="/dist/app.js"></x:sri-script>
<script src="/hide-employee-controls.js"></script>
<script src="/quick-create.js"></script>
<script src="/dashboard-nav.js"></script>
<script src="/time-interval-helpers.js"></script>
<script src="/timecard-export.js"></script>
</body>
</html>
