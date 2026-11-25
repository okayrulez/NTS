SELECT CONVERT(varchar(24),p.Id) AS id, CONVERT(varchar(24),p.CategoryId) AS category,
       p.Name AS name, b.Name AS brand, p.DepartmentName AS department, p.MamulCode AS code,
       CONVERT(varchar(24),TRY_CONVERT(bigint,p.StyleId)) AS styleId,
       CONVERT(varchar(24),TRY_CONVERT(bigint,p.MainStyleCardId)) AS mainId,
       p.SampleTypeVersion AS sampleVersion, media.FileName AS imageFile, media.IsAzure AS onSite,
       CASE WHEN p.CreatedOn >= @since AND p.CreatedOn <= @until THEN CONVERT(varchar(40),SWITCHOFFSET(p.CreatedOn,'+00:00'),127) END AS addedAt,
       CONVERT(varchar(40),SWITCHOFFSET(audit.changedAt,'+00:00'),127) AS changedAt,
       CASE WHEN audit.changedAt=p.CreatedOn THEN 'created' ELSE 'updated' END AS changeKind
FROM dbo.Catalog_Product AS p
LEFT JOIN dbo.Catalog_Brand AS b ON b.Id=p.BrandId
LEFT JOIN dbo.Core_Media AS media ON media.Id=p.ThumbnailImageId
CROSS APPLY (
 SELECT MAX(times.stamp) AS changedAt
 FROM (VALUES (p.CreatedOn),(p.LatestUpdatedOn),(p.LatestExtremeUpdatedOn)) AS times(stamp)
 WHERE times.stamp >= @since AND times.stamp <= @until
) AS audit
WHERE p.IsDeleted=0 AND p.IsVisible=0
  AND audit.changedAt IS NOT NULL
  AND TRY_CONVERT(bigint,p.StyleId)>0
ORDER BY audit.changedAt DESC,p.Id DESC;
