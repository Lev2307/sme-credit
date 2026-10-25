import { Avatar, type AvatarProps } from '@mantine/core';
import { avatarName } from '@/shared/lib/avatarName';

type Props = Omit<AvatarProps, 'name' | 'color'> & { name: string };

// Кружок с инициалами вместо фото. Цвет Mantine выбирает по имени: у одного человека он всегда один
export function UserAvatar({ name, size = 40, ...rest }: Props) {
  return <Avatar name={avatarName(name)} color="initials" radius="xl" size={size} {...rest} />;
}
