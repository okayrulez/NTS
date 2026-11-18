SELECT I.RecId AS SampleRecId,I.InventoryCode,I.InventoryName,I.RouteId,
 R.RouteName,R.InUse AS RouteInUse,R.IsDeleted AS RouteIsDeleted,
 CASE WHEN R.RecId IS NULL OR RP.ActiveRouteItemCount=0 THEN 'unknown' ELSE 'selected-planned' END AS IntermediatePlanState,
 RP.ActiveRouteItemCount,
 CASE WHEN R.RecId IS NULL OR RP.ActiveRouteItemCount=0 THEN NULL ELSE RP.HasPrint END AS PlannedPrint,
 CASE WHEN R.RecId IS NULL OR RP.ActiveRouteItemCount=0 THEN NULL ELSE RP.HasEmbroidery END AS PlannedEmbroidery,
 CASE WHEN R.RecId IS NULL OR RP.ActiveRouteItemCount=0 THEN NULL WHEN RP.HasPrint=0 AND RP.HasEmbroidery=0 THEN 1 ELSE 0 END AS PlannedNoPrintEmbroidery
FROM dbo.IM_Item I
LEFT JOIN dbo.MA_Route R ON R.RecId=I.RouteId AND ISNULL(R.IsDeleted,0)=0 AND ISNULL(R.InUse,1)=1
OUTER APPLY (
 SELECT COUNT_BIG(*) AS ActiveRouteItemCount,
 MAX(CASE WHEN RI.ProcessId=4 THEN 1 ELSE 0 END) AS HasPrint,
 MAX(CASE WHEN RI.ProcessId=5 THEN 1 ELSE 0 END) AS HasEmbroidery
 FROM dbo.MA_RouteItem RI
 WHERE RI.RouteId=R.RecId AND ISNULL(RI.IsDeleted,0)=0 AND ISNULL(RI.InUse,1)=1
) RP
WHERE ISNULL(I.IsDeleted,0)=0 AND I.RecId IN ({{MATCHED_IDS}});
