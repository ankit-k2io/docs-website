import { unified } from 'unified11';
import parse from 'rehype-parse9';
import rehype2remark from 'rehype-remark10';
import stringify from 'remark-stringify10';
import frontmatter from 'remark-frontmatter5';
import remarkMdx from 'remark-mdx2.3';
import remarkMdxjs from 'remark-mdxjs';
import handlers from './utils/handlers.js';
import { defaultHandlers } from 'hast-util-to-mdast9';
import u from 'unist-builder';
import last from 'lodash/last.js';
import yaml from 'js-yaml';
import { configuration } from './configuration.js';

const component = (h, node) => {
  if (!node.properties || !node.properties.dataType) {
    return defaultHandlers[node.tagName](h, node);
  }

  const { dataType, dataComponent } = node.properties;

  if (dataType === 'prop') {
    return null;
  }

  const key =
    dataType === 'component' ? dataComponent || node.tagName : dataType;

  const handler = handlers[key];

  if (!handler || !handler.deserialize) {
    throw new Error(
      `Unable to deserialize node: '${key}'. Please specify a deserializer in 'scripts/actions/utils/handlers.js'`
    );
  }

  return handler.deserialize(h, node);
};

const headingWithCustomId = (state, node) => {
  const result = defaultHandlers.h1(state, node);
  const { id } = node.properties || {};

  if (!id) {
    return result;
  }

  const value = `#${id}`;
  const lastChild = last(result.children);
  const linkReference = u(
    'linkReference',
    {
      identifier: value,
      label: value,
      referenceType: 'shortcut',
    },
    [u('text', value)]
  );

  if (lastChild.type === 'text' && !lastChild.value.match(/\s$/)) {
    lastChild.value = `${lastChild.value} `;
  } else {
    result.children.push(u('text', ' '));
  }

  result.children.push(linkReference);

  return result;
};

const stripTranslateFrontmatter = () => {
  const transformer = (tree) => {
    if (tree?.children[0]?.type === 'yaml') {
      const frontmatterObj = yaml.load(tree.children[0].value);
      delete frontmatterObj.translate;
      delete frontmatterObj.redirects;
      frontmatterObj.translationType = configuration.TRANSLATION.TYPE;
      const frontmatterStr = yaml
        .dump(frontmatterObj, { lineWidth: -1 })
        .trim();
      tree.children[0].value = frontmatterStr;
      return tree;
    }
  };

  return transformer;
};

const processor = unified()
  .use(parse)
  .use(rehype2remark, {
    handlers: {
      code: component,
      table: component,
      thead: component,
      tbody: component,
      tr: component,
      td: component,
      th: component,
      span: component,
      div: component,
      pre: component,
      var: component,
      mark: component,
      h1: headingWithCustomId,
      h2: headingWithCustomId,
      h3: headingWithCustomId,
      h4: headingWithCustomId,
      h5: headingWithCustomId,
      h6: headingWithCustomId,
    },
  })
  // order matters here.
  // remark-mdx must come before remark-stringify, because it adds handlers
  // for MDX nodes like `mdxJsxTextElement` and otherwise, remark-stringfy
  // won't know how to stringify those nodes.
  .use(remarkMdx)
  .use(stringify, {
    bullet: '*',
    fences: true,
    listItemIndent: '1',
  })
  .use(frontmatter, ['yaml'])
  .use(stripTranslateFrontmatter);

const deserializeHTML = async (html) => {
  const vfile = await processor.process(html);

  return vfile.toString().trim();
};

export default deserializeHTML;
