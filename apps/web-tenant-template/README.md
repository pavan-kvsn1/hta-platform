# Web Tenant Template

This is a template for creating new tenant applications in the HTA Platform monorepo.

## Creating a New Tenant

### 1. Copy the Template

```bash
cp -r apps/web-tenant-template apps/web-{your-tenant-slug}
```

### 2. Update Package Configuration

Edit `apps/web-{your-tenant-slug}/package.json`:

```json
{
  "name": "@hta/web-{your-tenant-slug}",
  ...
}
```

### 3. Configure Tenant Settings

Edit `src/config/tenant.ts` with your tenant's information:

- `id` - Your tenant ID (matches database)
- `slug` - URL-friendly identifier
- `name` - Company display name
- `branding` - Logo, colors, favicon
- `metadata` - Page title, description
- `contact` - Support email, website
- `features` - Toggle features on/off
- `settings` - Operational settings

### 4. Customize Branding

#### Colors

Edit `src/app/globals.css` to set your brand colors:

```css
:root {
  --primary: #your-brand-color;
  --ring: #your-brand-color;
  --accent-foreground: #your-brand-color;
  ...
}
```

#### Logo

Replace `public/logo.png` with your company logo.

#### Favicon

Replace `public/favicon.ico` with your favicon.

### 5. Add to Workspace

The new app is automatically detected by pnpm workspaces.

### 6. Database Setup

Ensure your tenant exists in the database:

```sql
INSERT INTO "Tenant" (id, slug, name, domain, settings)
VALUES (
  'your-tenant-id',
  'your-tenant-slug',
  'Your Company Name',
  'yourcompany.com',
  '{}'
);
```

### 7. Run Development Server

```bash
# From monorepo root
pnpm dev --filter @hta/web-{your-tenant-slug}
```

## Directory Structure

```
web-{tenant}/
├── public/
│   ├── logo.png          # Company logo
│   └── favicon.ico       # Favicon
├── src/
│   ├── app/
│   │   ├── (auth)/       # Authentication pages
│   │   ├── (dashboard)/  # Dashboard pages (TODO)
│   │   ├── (public)/     # Public pages (TODO)
│   │   ├── globals.css   # Color scheme
│   │   └── layout.tsx    # Root layout
│   ├── components/
│   │   ├── layout/       # Layout components
│   │   ├── providers/    # Context providers
│   │   └── ui/           # UI components
│   ├── config/
│   │   └── tenant.ts     # Tenant configuration
│   ├── hooks/            # Custom hooks
│   └── lib/              # Utilities
├── package.json
└── README.md
```

## Features Toggle

Features can be enabled/disabled per tenant in `tenant.ts`:

| Feature | Description |
|---------|-------------|
| `customerPortal` | Enable customer login & dashboard |
| `internalRequests` | Allow internal calibration requests |
| `multipleInstruments` | Multiple instruments per certificate |
| `emailNotifications` | Send email notifications |
| `downloadTokens` | Secure certificate download links |
| `darkMode` | Dark mode toggle in UI |

## Color Customization

The color scheme uses CSS custom properties. Key variables:

| Variable | Usage |
|----------|-------|
| `--primary` | Buttons, links, accents |
| `--primary-foreground` | Text on primary color |
| `--accent` | Highlights, hover states |
| `--destructive` | Error states, delete actions |
| `--chart-1` through `--chart-5` | Chart/graph colors |

Both light and dark modes are supported. Make sure to update both `:root` and `.dark` selectors.
