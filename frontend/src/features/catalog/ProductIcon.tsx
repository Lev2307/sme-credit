import {
  IconBolt,
  IconBuildingFactory2,
  IconCash,
  IconPackage,
  type Icon,
  type IconProps,
} from '@tabler/icons-react';
import { createElement } from 'react';

// Иконка продукта в списках и карточках. Неизвестный продукт получает общую «деньги»
const ICONS: Record<string, Icon> = {
  EXPRESS: IconBolt,
  WORKING_CAPITAL: IconPackage,
  INVESTMENT: IconBuildingFactory2,
};

type Props = IconProps & { code: string };

export function ProductIcon({ code, ...props }: Props) {
  return createElement(ICONS[code] ?? IconCash, { 'aria-hidden': true, ...props });
}
