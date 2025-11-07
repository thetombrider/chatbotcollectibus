'use client'

import React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ArrowUp, Square, X, Globe } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

// Textarea Component
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  className?: string
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      'flex w-full rounded-md border-none bg-transparent px-3 py-2.5 text-base text-gray-900 placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px] resize-none scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400',
      className
    )}
    ref={ref}
    rows={1}
    {...props}
  />
))

Textarea.displayName = 'Textarea'

// Tooltip Components
const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      'z-50 overflow-hidden rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
      className
    )}
    {...props}
  />
))

TooltipContent.displayName = TooltipPrimitive.Content.displayName

// Dialog Components
const Dialog = DialogPrimitive.Root
const DialogPortal = DialogPrimitive.Portal

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
))

DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 grid w-full max-w-[90vw] md:max-w-[800px] translate-x-[-50%] translate-y-[-50%] gap-4 border border-gray-200 bg-white p-0 shadow-xl duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 rounded-2xl',
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 z-10 rounded-full bg-gray-100 p-2 hover:bg-gray-200 transition-all">
        <X className="h-5 w-5 text-gray-600 hover:text-gray-900" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))

DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight text-gray-900', className)}
    {...props}
  />
))

DialogTitle.displayName = DialogPrimitive.Title.displayName

// Button Component
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const variantClasses = {
      default: 'bg-gray-900 hover:bg-gray-800 text-white',
      outline: 'border border-gray-300 bg-transparent hover:bg-gray-50',
      ghost: 'bg-transparent hover:bg-gray-100',
    }

    const sizeClasses = {
      default: 'h-10 px-4 py-2',
      sm: 'h-8 px-3 text-sm',
      lg: 'h-12 px-6',
      icon: 'h-8 w-8 rounded-full aspect-[1/1]',
    }

    return (
      <button
        className={cn(
          'inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)

Button.displayName = 'Button'


// ImageViewDialog Component
interface ImageViewDialogProps {
  imageUrl: string | null
  onClose: () => void
}

const ImageViewDialog: React.FC<ImageViewDialogProps> = ({ imageUrl, onClose }) => {
  if (!imageUrl) return null

  return (
    <Dialog open={!!imageUrl} onOpenChange={onClose}>
      <DialogContent className="p-0 border-none bg-transparent shadow-none max-w-[90vw] md:max-w-[800px]">
        <DialogTitle className="sr-only">Image Preview</DialogTitle>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative bg-white rounded-2xl overflow-hidden shadow-2xl border border-gray-200"
        >
          <img
            src={imageUrl}
            alt="Full preview"
            className="w-full max-h-[80vh] object-contain rounded-2xl"
          />
        </motion.div>
      </DialogContent>
    </Dialog>
  )
}

// PromptInput Context and Components
interface PromptInputContextType {
  isLoading: boolean
  value: string
  setValue: (value: string) => void
  maxHeight: number | string
  onSubmit?: () => void
  disabled?: boolean
}

const PromptInputContext = React.createContext<PromptInputContextType>({
  isLoading: false,
  value: '',
  setValue: () => {},
  maxHeight: 240,
  onSubmit: undefined,
  disabled: false,
})

function usePromptInput() {
  const context = React.useContext(PromptInputContext)
  if (!context) throw new Error('usePromptInput must be used within a PromptInput')
  return context
}

interface PromptInputProps {
  isLoading?: boolean
  value?: string
  onValueChange?: (value: string) => void
  maxHeight?: number | string
  onSubmit?: () => void
  children: React.ReactNode
  className?: string
  disabled?: boolean
  onDragOver?: (e: React.DragEvent) => void
  onDragLeave?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
}

const PromptInput = React.forwardRef<HTMLDivElement, PromptInputProps>(
  (
    {
      className,
      isLoading = false,
      maxHeight = 240,
      value,
      onValueChange,
      onSubmit,
      children,
      disabled = false,
      onDragOver,
      onDragLeave,
      onDrop,
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = React.useState(value || '')
    const handleChange = (newValue: string) => {
      setInternalValue(newValue)
      onValueChange?.(newValue)
    }

    return (
      <TooltipProvider>
        <PromptInputContext.Provider
          value={{
            isLoading,
            value: value ?? internalValue,
            setValue: onValueChange ?? handleChange,
            maxHeight,
            onSubmit,
            disabled,
          }}
        >
          <div
            ref={ref}
            className={cn(
              'rounded-2xl border border-gray-200 bg-white p-1.5 shadow-sm transition-all duration-200',
              isLoading && 'border-red-400/50',
              className
            )}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            {children}
          </div>
        </PromptInputContext.Provider>
      </TooltipProvider>
    )
  }
)

PromptInput.displayName = 'PromptInput'

interface PromptInputTextareaProps {
  disableAutosize?: boolean
  placeholder?: string
}

const PromptInputTextarea: React.FC<PromptInputTextareaProps & React.ComponentProps<typeof Textarea>> = ({
  className,
  onKeyDown,
  disableAutosize = false,
  placeholder,
  ...props
}) => {
  const { value, setValue, maxHeight, onSubmit, disabled } = usePromptInput()
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    if (disableAutosize || !textareaRef.current) return
    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height =
      typeof maxHeight === 'number'
        ? `${Math.min(textareaRef.current.scrollHeight, maxHeight)}px`
        : `min(${textareaRef.current.scrollHeight}px, ${maxHeight})`
  }, [value, maxHeight, disableAutosize])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSubmit?.()
    }
    onKeyDown?.(e)
  }

  return (
    <Textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      className={cn('text-base', className)}
      disabled={disabled}
      placeholder={placeholder}
      {...props}
    />
  )
}

interface PromptInputActionsProps extends React.HTMLAttributes<HTMLDivElement> {}

const PromptInputActions: React.FC<PromptInputActionsProps> = ({ children, className, ...props }) => (
  <div className={cn('flex items-center gap-2', className)} {...props}>
    {children}
  </div>
)

interface PromptInputActionProps extends React.ComponentProps<typeof Tooltip> {
  tooltip: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

const PromptInputAction: React.FC<PromptInputActionProps> = ({
  tooltip,
  children,
  className,
  side = 'top',
  ...props
}) => {
  const { disabled } = usePromptInput()

  return (
    <Tooltip {...props}>
      <TooltipTrigger asChild disabled={disabled}>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} className={className}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

// Main PromptInputBox Component
interface PromptInputBoxProps {
  input: string
  setInput: (value: string) => void
  onSend: () => void
  isLoading?: boolean
  disabled?: boolean
  placeholder?: string
  className?: string
  webSearchEnabled?: boolean
  onWebSearchToggle?: (enabled: boolean) => void
}

export const PromptInputBox = React.forwardRef<HTMLDivElement, PromptInputBoxProps>(
  (
    {
      input,
      setInput,
      onSend,
      isLoading = false,
      disabled = false,
      placeholder = 'Scrivi un messaggio...',
      className,
      webSearchEnabled = false,
      onWebSearchToggle,
    },
    ref
  ) => {
    const [files, setFiles] = React.useState<File[]>([])
    const [filePreviews, setFilePreviews] = React.useState<{ [key: string]: string }>({})
    const [selectedImage, setSelectedImage] = React.useState<string | null>(null)
    const [showSearch, setShowSearch] = React.useState(webSearchEnabled)

    const promptBoxRef = React.useRef<HTMLDivElement>(null)

    // Sync showSearch with webSearchEnabled prop
    React.useEffect(() => {
      setShowSearch(webSearchEnabled)
    }, [webSearchEnabled])

    const handleToggleSearch = () => {
      const newValue = !showSearch
      setShowSearch(newValue)
      onWebSearchToggle?.(newValue)
    }

    const isImageFile = (file: File) => file.type.startsWith('image/')

    const processFile = (file: File) => {
      if (!isImageFile(file)) {
        console.log('Only image files are allowed')
        return
      }
      if (file.size > 10 * 1024 * 1024) {
        console.log('File too large (max 10MB)')
        return
      }
      setFiles([file])
      const reader = new FileReader()
      reader.onload = (e) => setFilePreviews({ [file.name]: e.target?.result as string })
      reader.readAsDataURL(file)
    }

    const handleDragOver = React.useCallback((e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }, [])

    const handleDragLeave = React.useCallback((e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }, [])

    const handleDrop = React.useCallback(
      (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const files = Array.from(e.dataTransfer.files)
        const imageFiles = files.filter((file) => isImageFile(file))
        if (imageFiles.length > 0) processFile(imageFiles[0])
      },
      []
    )

    const handleRemoveFile = (index: number) => {
      const fileToRemove = files[index]
      if (fileToRemove && filePreviews[fileToRemove.name]) setFilePreviews({})
      setFiles([])
    }

    const openImageModal = (imageUrl: string) => setSelectedImage(imageUrl)

    const handlePaste = React.useCallback(
      (e: ClipboardEvent) => {
        const items = e.clipboardData?.items
        if (!items) return
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            const file = items[i].getAsFile()
            if (file) {
              e.preventDefault()
              processFile(file)
              break
            }
          }
        }
      },
      []
    )

    React.useEffect(() => {
      document.addEventListener('paste', handlePaste)
      return () => document.removeEventListener('paste', handlePaste)
    }, [handlePaste])

    const handleSubmit = () => {
      if (input.trim() || files.length > 0) {
        // Call the original onSend handler
        // The webSearchEnabled flag is already synced via onWebSearchToggle
        onSend()

        // Clear state after sending
        setFiles([])
        setFilePreviews({})
      }
    }


    const hasContent = input.trim() !== '' || files.length > 0

    return (
      <>
        <div className="relative z-10 backdrop-blur-sm bg-white/80 border-t border-gray-100">
          <div className="max-w-3xl mx-auto px-4 py-3 pb-safe">
            <PromptInput
              value={input}
              onValueChange={setInput}
              isLoading={isLoading}
              onSubmit={handleSubmit}
              className={cn(
              'w-full bg-white border-gray-200 shadow-sm transition-all duration-200 ease-in-out',
                className
              )}
              disabled={isLoading || disabled}
              ref={ref || promptBoxRef}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {files.length > 0 && (
                <div className="flex flex-wrap gap-2 p-0 pb-1 transition-all duration-300">
                  {files.map((file, index) => (
                    <div key={index} className="relative group">
                      {file.type.startsWith('image/') && filePreviews[file.name] && (
                        <div
                          className="w-16 h-16 rounded-xl overflow-hidden cursor-pointer transition-all duration-300"
                          onClick={() => openImageModal(filePreviews[file.name])}
                        >
                          <img
                            src={filePreviews[file.name]}
                            alt={file.name}
                            className="h-full w-full object-cover"
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRemoveFile(index)
                            }}
                            className="absolute top-1 right-1 rounded-full bg-black/70 p-0.5 opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3 text-white" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <PromptInputTextarea
                placeholder={showSearch ? 'Cerca sul web...' : placeholder}
                className="text-base"
              />

              <PromptInputActions className="flex items-center justify-between gap-2 p-0 pt-2">
                <div className="flex items-center gap-1">
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={handleToggleSearch}
                    className={cn(
                      'rounded-lg transition-all flex items-center gap-1 px-2 py-1 h-7',
                      showSearch
                        ? 'bg-blue-50 text-blue-600'
                        : 'bg-transparent text-gray-400 hover:text-gray-600'
                    )}
                      disabled={disabled}
                    >
                      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                        <motion.div
                          animate={{ rotate: showSearch ? 360 : 0, scale: showSearch ? 1.1 : 1 }}
                          whileHover={{
                            rotate: showSearch ? 360 : 15,
                            scale: 1.1,
                            transition: { type: 'spring', stiffness: 300, damping: 10 },
                          }}
                          transition={{ type: 'spring', stiffness: 260, damping: 25 }}
                        >
                          <Globe className={cn('w-4 h-4', showSearch ? 'text-blue-600' : 'text-inherit')} />
                        </motion.div>
                      </div>
                      <AnimatePresence>
                        {showSearch && (
                          <motion.span
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: 'auto', opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="text-xs overflow-hidden whitespace-nowrap text-blue-600 flex-shrink-0"
                          >
                            Ricerca
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </button>
                  </div>
                </div>

                <PromptInputAction
                  tooltip={isLoading ? 'Interrompi generazione' : hasContent ? 'Invia messaggio' : 'Invia messaggio'}
                >
                  <Button
                    variant="default"
                    size="icon"
                    className={cn(
                      'h-7 w-7 rounded-lg transition-all duration-200',
                      hasContent
                        ? 'bg-gray-900 hover:bg-gray-800 text-white'
                        : 'bg-gray-100 text-gray-400'
                    )}
                    onClick={() => {
                      if (hasContent) handleSubmit()
                    }}
                    disabled={(isLoading && !hasContent) || disabled || !hasContent}
                  >
                    {isLoading ? (
                      <Square className="h-4 w-4 fill-white animate-pulse" />
                    ) : (
                      <ArrowUp className="h-4 w-4 text-inherit" />
                    )}
                  </Button>
                </PromptInputAction>
              </PromptInputActions>
            </PromptInput>
          </div>
        </div>
        <ImageViewDialog imageUrl={selectedImage} onClose={() => setSelectedImage(null)} />
      </>
    )
  }
)

PromptInputBox.displayName = 'PromptInputBox'

