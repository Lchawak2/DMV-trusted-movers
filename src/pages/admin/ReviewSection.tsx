import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { smsLink } from '../../lib/format'
import SendText from '../../components/SendText'

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n)

// A finished job: the customer's rating, or a nudge to ask for one
export default function ReviewSection({ jobId, quoteId }: { jobId: string; quoteId: string | null }) {
  const [review, setReview] = useState<{ rating: number; comment: string | null } | null | undefined>(undefined)
  const [ask, setAsk] = useState<{ phone: string | null; text: string } | null>(null)

  useEffect(() => {
    supabase.from('job_reviews').select('rating, comment').eq('job_id', jobId).maybeSingle()
      .then(({ data }) => setReview(data))
    if (!quoteId) return
    supabase.from('quotes').select('token, move_requests(customers(full_name, phone))').eq('id', quoteId).maybeSingle()
      .then(({ data }) => {
        if (!data) return
        const c = (data.move_requests as unknown as { customers: { full_name: string; phone: string | null } | null } | null)?.customers
        const first = c?.full_name.split(' ')[0] ?? ''
        setAsk({
          phone: c?.phone ?? null,
          text: `Hi ${first}, thanks again for moving with DMV Trusted Movers! How did we do? It takes 30 seconds: ${location.origin}/quote/${data.token}`,
        })
      })
  }, [jobId, quoteId])

  if (review === undefined) return null
  return (
    <section className="card">
      <h3>Customer rating</h3>
      {review ? (
        <>
          <p className="stars" aria-label={`${review.rating} out of 5`}>{stars(review.rating)}</p>
          {review.comment ? <p>“{review.comment}”</p> : <p className="muted small">No comment.</p>}
        </>
      ) : (
        <>
          <p className="muted small">Not rated yet. Ask the customer while the move is fresh.</p>
          {ask?.phone && (
            <div className="row">
              <SendText to={ask.phone} body={ask.text} label="Text review request" />
              <a className="secondary" href={smsLink(ask.phone, ask.text)}>Text from my phone</a>
            </div>
          )}
        </>
      )}
    </section>
  )
}
