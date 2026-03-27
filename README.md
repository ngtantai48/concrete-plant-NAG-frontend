# Concrete Plant NAG Frontend

Frontend project for the Concrete Plant Management software. Built with modern Next.js architecture, featuring real-time maps and a multilingual administration system.

## 🚀 Technologies

- **Framework:** [Next.js](https://nextjs.org/) (App Router)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **UI & CSS:** [Tailwind CSS](https://tailwindcss.com/) with [Ant Design](https://ant.design/) and [Shadcn UI](https://ui.shadcn.com/)
- **Maps:** [Leaflet](https://leafletjs.com/) & [React-Leaflet](https://react-leaflet.js.org/)
- **Real-time:** [Socket.io-client](https://socket.io/) (Vehicle/station tracking and status mapping)
- **Internationalization (i18n):** [Next-Intl](https://next-intl-docs.vercel.app/)
- **Global State Management:** [Zustand](https://github.com/pmndrs/zustand)
- **HTTP Client:** [Axios](https://axios-http.com/)

---

## 💻 Getting Started

### Prerequisites

- **Node.js:** version > 24

### 1. Install Dependencies

The project supports `npm`, `pnpm`, or `yarn`. Run the following command in the root directory:

```bash
npm install
# or 
pnpm install
# or
yarn install
```

### 2. Run the Development Server

Start the local server:

```bash
npm run dev
# or
pnpm dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the application. The page will automatically hot-reload when you save changes to the files in the `src/` directory.

---

## 🌍 Learn More About Next.js

To learn more about Next.js and its features, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

---

## ⚙️ Deployment

### Build for Production

Create an optimized production build:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

### Deploy on Vercel

The easiest and most optimized way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme). Check out the documentation on [Next.js deployment](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
