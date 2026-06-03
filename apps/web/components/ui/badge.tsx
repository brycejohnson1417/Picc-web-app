import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition', {
  variants: {
    variant: {
      default: 'border-transparent bg-primary text-white',
      secondary: 'border-transparent bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100',
      success: 'border-transparent bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300',
      warning: 'border-transparent bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
      danger: 'border-transparent bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300',
      outline: 'text-slate-700 dark:text-slate-200',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
