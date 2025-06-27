import React, {memo, type ReactNode} from 'react';
import {useThemeConfig} from '@docusaurus/theme-common';
import Heading from '@theme/Heading';
import type {Props} from '@theme/BlogSidebar/Content';

import { format } from 'date-fns';
import type {BlogSidebarItem} from "@docusaurus/plugin-content-blog";

// Custom sidebar grouping implementation as per
// https://github.com/facebook/docusaurus/issues/10736#issuecomment-2806626276

function groupBlogSidebarItemsByMonth(
    items: BlogSidebarItem[],
): [string, BlogSidebarItem[]][] {
  const map = new Map<string, BlogSidebarItem[]>();

  items.forEach((item) => {
    const date = new Date(item.date);
    const monthYear = format(date, 'MMMM yyyy'); // e.g., April 2025

    if (!map.has(monthYear)) {
      map.set(monthYear, []);
    }
    map.get(monthYear)!.push(item);
  });

  return Array.from(map.entries());
}

function BlogSidebarYearGroup({
  year,
  yearGroupHeadingClassName,
  children,
}: {
  year: string;
  yearGroupHeadingClassName?: string;
  children: ReactNode;
}) {
  return (
    <div role="group">
      <Heading as="h3" className={yearGroupHeadingClassName}>
        {year}
      </Heading>
      {children}
    </div>
  );
}

function BlogSidebarContent({
  items,
  yearGroupHeadingClassName,
  ListComponent,
}: Props): ReactNode {
  const themeConfig = useThemeConfig();
  if (themeConfig.blog.sidebar.groupByYear) {
    const itemsByMonth = groupBlogSidebarItemsByMonth(items);
    return (
      <>
        {itemsByMonth.map(([month, monthItems]) => (
          <BlogSidebarYearGroup
            key={month}
            year={month}
            yearGroupHeadingClassName={yearGroupHeadingClassName}>
            <ListComponent items={monthItems} />
          </BlogSidebarYearGroup>
        ))}
      </>
    );
  } else {
    return <ListComponent items={items} />;
  }
}

export default memo(BlogSidebarContent);
