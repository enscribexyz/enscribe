// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

import 'dotenv/config';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Enscribe",
  tagline: "Easily name your Ethereum smart contracts with ENS names using Enscribe",
  favicon: "img/favicon.ico",

  url: "https://www.enscribe.xyz",
  baseUrl: "/",

  trailingSlash: false,

  // GitHub pages deployment config
  organizationName: "enscribexyz",
  projectName: "enscribe",

  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",

  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  plugins: [
    async function tailwindPlugin(context, options) {
      return {
        name: "tailwind-plugin",
        configurePostCss(postcssOptions) {
          postcssOptions.plugins.push(require("@tailwindcss/postcss"))
          return postcssOptions
        },
      }
    },
  'docusaurus-plugin-image-zoom',
  ],

  markdown: {
    mermaid: true,
  },
  themes: ['@docusaurus/theme-mermaid'],

  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve("./sidebars.js"),
          editUrl:
            'https://github.com/enscribexyz/enscribe/tree/main/docs',
        },
        blog: {
          showReadingTime: true,
          blogSidebarTitle: 'All our posts',
          blogSidebarCount: 'ALL',
        },
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
        gtag: {
          trackingID: 'G-190T6LGDNH',
          anonymizeIP: true,
        },
      }),
    ],
  ],

  customFields: {
    // Put your custom environment here
    appUrl: process.env.APP_URL,
  },

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      // Replace with your project's social card
      image: "img/social-card.png",

      metadata: [
        { name: 'keywords', content: 'smart, contract, naming, naming smart contracts, web3, blockchain, ens, Ethereum Name Service, Ethereum, smart contracts, Enscribe, UX, smart contract deployment' },
        { name: 'description', content: 'Easily name your Ethereum smart contracts with ENS names using Enscribe. Live on Ethereum, Base, and Linea networks.' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:image', content: 'https://www.enscribe.xyz/img/social-card.png' },
        { property: 'og:image', content: 'https://www.enscribe.xyz/img/social-card.png' },
        { property: 'og:title', content: 'Enscribe – Name your smart contracts' },
        { property: 'og:description', content: 'Easily name your Ethereum smart contracts with ENS names using Enscribe. Live on Ethereum, Base, and Linea networks.' },
      ],

      headTags: [
        {
          tagName: 'link',
          attributes: {
            rel: 'preconnect',
            href: 'https://www.enscribe.xyz/',
          },
        },
        {
          tagName: 'script',
          attributes: {
            type: 'application/ld+json',
          },
          innerHTML: JSON.stringify({
            '@context': 'https://schema.org/',
            '@type': 'Organization',
            name: 'Enscribe',
            url: 'https://www.enscribe.xyz/',
            logo: 'https://www.enscribe.xyz/img/logo.svg',
          }),
        },
      ],

      navbar: {
        title: "Enscribe",
        logo: {
          alt: "Enscribe Logo",
          src: "img/logo.svg",
        },
        items: [
          {
            type: "docSidebar",
            sidebarId: "tutorialSidebar",
            position: "left",
            label: "Docs",
          },
          { to: "/blog", label: "Blog", position: "left" },
          {
            href: "https://github.com/enscribexyz/enscribe",
            label: "GitHub",
            position: "right",
          },
        ],
      },
      algolia: {
        appId: 'FDHVY14O0W',

        apiKey: 'a16f9c245539783b5555ed92781838aa',

        indexName: 'enscribe',
      },
      footer: {
        style: "dark",
        links: [
          {
            title: "Docs",
            items: [
              {
                label: "Introduction",
                to: "/docs",
              },
              {
                label: "Getting Started",
                to: "/docs/getting-started",
              },
            ],
          },
          {
            title: "Community",
            items: [
              {
                label: "Telegram",
                href: "https://t.me/enscribers",
              },
              {
                label: "Discord",
                href: "https://discord.gg/8QUMMdS5GY",
              },
              {
                label: "X",
                href: "https://x.com/enscribe_",
              },
              {
                label: "Farcaster",
                href: "https://warpcast.com/enscribe",
              },
            ],
          },
          {
            title: "More",
            items: [
              {
                label: "Blog",
                to: "/blog",
              },
              {
                label: "GitHub",
                href: "https://github.com/enscribexyz/enscribe",
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Web3 Labs Ltd. All rights reserved.`,
      },
      prism: {
        theme: require("prism-react-renderer").themes.dracula,
        additionalLanguages: ['solidity'],
      },
      colorMode: {
        defaultMode: "dark",
        disableSwitch: false,
        respectPrefersColorScheme: false,
      },
      zoom: {
        selector: '.markdown img:not(em img)', // avoids zooming on emoji or inline images
        background: {
          light: 'rgba(255, 255, 255, 0.95)',
          dark: 'rgba(50, 50, 50, 0.95)'
        },
        config: {} // optional medium-zoom config
      }
    }),
}

module.exports = config


