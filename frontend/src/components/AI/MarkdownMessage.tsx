import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'

const components: Components = {
  p:      ({ children }) => <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed mb-1.5 last:mb-0">{children}</p>,
  ul:     ({ children }) => <ul className="list-disc pl-4 my-1 space-y-1">{children}</ul>,
  ol:     ({ children }) => <ol className="list-decimal pl-4 my-1 space-y-1">{children}</ol>,
  li:     ({ children }) => <li className="text-xs text-gray-700 dark:text-gray-300 leading-snug">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-gray-100">{children}</strong>,
  em:     ({ children }) => <em className="italic text-gray-600 dark:text-gray-400">{children}</em>,
  h1:     ({ children }) => <h1 className="text-xs font-bold text-gray-900 dark:text-gray-100 mt-3 mb-1 first:mt-0">{children}</h1>,
  h2:     ({ children }) => <h2 className="text-xs font-bold text-gray-900 dark:text-gray-100 mt-2.5 mb-1 first:mt-0">{children}</h2>,
  h3:     ({ children }) => <h3 className="text-xs font-semibold text-gray-800 dark:text-gray-200 mt-2 mb-0.5 first:mt-0">{children}</h3>,
  hr:     () => <hr className="border-gray-200 dark:border-gray-700 my-2" />,
  code:   ({ children }) => <code className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-1 py-0.5 rounded text-[10px] font-mono">{children}</code>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-violet-300 dark:border-violet-700 pl-2 my-1 text-gray-500 dark:text-gray-400 italic">{children}</blockquote>,
}

interface Props {
  content: string
  className?: string
}

export function MarkdownMessage({ content, className = '' }: Props) {
  return (
    <div className={className}>
      <ReactMarkdown components={components}>{content}</ReactMarkdown>
    </div>
  )
}
