import { ProductImage } from "@/lib/catalog";

export interface HomeHeroSlide {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  href: string;
  image: ProductImage;
}

export interface HeroSlideRecord extends HomeHeroSlide {
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
