import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
const sidebars: SidebarsConfig = {
  // Guide sidebar with manual configuration for proper labels
  guidesSidebar: [
    {
      type: 'doc',
      id: 'index',
      label: 'Welcome to the Guides',
    },
    // {
    //   type: 'doc',
    //   id: 'common-patterns',
    //   label: 'Common Patterns',
    // },
    {
      type: 'category',
      label: 'How To Guides',
      items: [
        'how-to-guides/deploy-and-name-smart-contract',
        'how-to-guides/name-existing-smart-contract',
        'how-to-guides/name-contract-l2-networks',
      ],
    },
    {
      type: 'category',
      label: 'Concepts',
      items: [
        'concepts/ens-primary-names-explained',
        'concepts/l2-primary-names-explained',
      ],
    },
    {
      type: 'category',
      label: 'Best Practices',
      items: [
        'best-practices/dao',
        'best-practices/consumer-apps',
        'best-practices/l2',
        'best-practices/defi-protocols',
      ],
    },
  ],
};

export default sidebars;
