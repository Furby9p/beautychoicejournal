export const selectPublished=articles=>articles.filter(a=>a.publicationStatus==='published'&&a.reviewStatus==='approved');
