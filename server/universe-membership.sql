-- Only catalogue records changed within the tracking window qualify.
SELECT DISTINCT CONVERT(varchar(24), ids.styleId) AS styleId,
       CONVERT(varchar(24),TRY_CONVERT(bigint,p.MainStyleCardId)) AS mainId
FROM OPENJSON(@styles) WITH (styleId bigint '$') AS ids
JOIN dbo.Catalog_Product AS p ON TRY_CONVERT(bigint,p.StyleId)=ids.styleId
CROSS APPLY (
 SELECT MAX(times.stamp) AS changedAt
 FROM (VALUES (p.CreatedOn),(p.LatestUpdatedOn),(p.LatestExtremeUpdatedOn)) AS times(stamp)
 WHERE times.stamp >= @since AND times.stamp <= @until
) AS audit
WHERE p.IsDeleted=0 AND audit.changedAt IS NOT NULL;
