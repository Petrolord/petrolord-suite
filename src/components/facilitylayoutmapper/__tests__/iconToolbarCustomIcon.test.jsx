// W7F: a custom tool rendered a literal <img-replace> element, so its
// uploaded icon never showed. Negative control: on the old toolbar there is
// an img-replace element and no img.
import React from 'react';
import { render } from '@testing-library/react';
import IconToolbar from '../IconToolbar';

test('custom tools show their uploaded image, or a generic icon', () => {
  const { container } = render(
    <IconToolbar
      activeTool={null}
      setActiveTool={() => {}}
      customIcons={[
        { name: 'My Skid', isCustom: true, iconUrl: 'data:image/png;base64,AAAA', type: 'icon' },
        { name: 'No Image', isCustom: true, iconUrl: null, type: 'icon' },
      ]}
    />,
  );
  expect(container.querySelector('img-replace')).toBeNull();
  const img = container.querySelector('img');
  expect(img).not.toBeNull();
  expect(img.getAttribute('src')).toBe('data:image/png;base64,AAAA');
  const noImage = [...container.querySelectorAll('button')].find((b) => b.textContent === 'No Image');
  expect(noImage.querySelector('svg')).not.toBeNull();
});
