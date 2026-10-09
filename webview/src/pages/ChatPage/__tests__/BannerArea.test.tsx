import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BannerArea } from '../BannerArea';
import { TopBarProvider, TOP_BAR_HEIGHT } from '@/contexts/TopBarContext';

/** The fixed box the banners hang in; its `top` is what keeps them clear of the bar. */
function bannerBox() {
  return screen.getByText('banner').parentElement as HTMLElement;
}

describe('BannerArea', () => {
  it('hangs the banners under the top bar', () => {
    render(
      <BannerArea>
        <span>banner</span>
      </BannerArea>,
    );

    expect(bannerBox().style.top).toBe(`${TOP_BAR_HEIGHT}px`);
  });

  it('puts the banners at the top edge when the top bar is hidden', () => {
    render(
      <TopBarProvider displayed={false}>
        <BannerArea>
          <span>banner</span>
        </BannerArea>
      </TopBarProvider>,
    );

    expect(bannerBox().style.top).toBe('0px');
  });
});
