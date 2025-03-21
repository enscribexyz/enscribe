// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

import 'dotenv/config';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Enscribe",
  tagline: "ENScribe your Smart Contracts",
  favicon: "img/favicon.ico",

  url: "https://enscribe.xyz",
  baseUrl: "/",

  // GitHub pages deployment config
  organizationName: "enscribe.xyz",
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
        },
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
      }),
    ],
  ],

  customFields: {
    // Put your custom environment here
    appUrl : process.env.APP_URL,
  },

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      // Replace with your project's social card
      image: "img/social-card.jpg",
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
      footer: {
        style: "dark",
        links: [
          {
            title: "Docs",
            items: [
              {
                label: "Getting Started",
                to: "/docs/",
              },
            ],
          },
          {
            title: "Community",
            items: [
              {
                label: "Discord",
                href: "https://discord.gg/8QUMMdS5GY",
              },
              {
                label: "X",
                href: "https://x.com/enscribe_eth",
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
      },
      colorMode: {
        defaultMode: "dark",
        disableSwitch: false,
        respectPrefersColorScheme: false,
      },
    }),
}

module.exports = config


