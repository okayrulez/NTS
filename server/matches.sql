SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
-- Materialize the small identity set before looking up item and attachment details.
WITH Identities AS (
 SELECT RecId,0 AS NeedsPhoto FROM #ChangedItem
 UNION ALL SELECT RecId,1 FROM #Samples
 UNION ALL SELECT s.MainStyleCardId,1
 FROM #Samples a JOIN dbo.IM_Item s ON s.RecId=a.RecId
 WHERE s.MainStyleCardId IS NOT NULL
)
SELECT RecId,MAX(NeedsPhoto) AS NeedsPhoto INTO #ScopedItem FROM Identities GROUP BY RecId;
CREATE UNIQUE CLUSTERED INDEX ScopedItemId ON #ScopedItem (RecId);
SELECT ch.photoChangedAt AS PhotoChangeAt,ch.changedAt AS ItemChangeAt,i.InsertedAt,i.PatternNo,i.MarkId,i.ItemDepartmentId AS DepartmentId,MK.Explanation AS Brand,DP.DepartmentName AS Department,i.RecId,i.InventoryCode,i.InventoryName,i.InventoryType,i.IsSample,i.SampleStatus,i.SampleStatusAt,i.StyleCardId,i.MainStyleCardId,i.StyleSampleTypeId,i.StyleSampleRevisionNo,i.UD_StyleSampleExp,i.UD_UFFSampleProcess,i.UD_UFFSampleProcessPatterns,i.UD_IWSCuttingStatus,i.UD_AccountContactName,i.UpdatedAt,t.SampleTypeName,
(SELECT TOP (1) a.RecId FROM dbo.IM_ItemAttachment a WHERE ids.NeedsPhoto=1 AND a.InventoryId=i.RecId AND ISNULL(a.IsDeleted,0)=0 AND (a.Attachment IS NOT NULL OR a.Thumbnail IS NOT NULL) ORDER BY a.RecId DESC) AS AttachmentId
FROM #ScopedItem ids JOIN dbo.IM_Item i ON i.RecId=ids.RecId LEFT JOIN dbo.IM_Mark MK ON MK.RecId=i.MarkId LEFT JOIN dbo.IM_ItemDepartment DP ON DP.RecId=i.ItemDepartmentId LEFT JOIN dbo.MD_StyleSampleType t ON t.RecId=i.StyleSampleTypeId
LEFT JOIN #ChangedItem ch ON ch.RecId=i.RecId
WHERE ISNULL(i.IsDeleted,0)=0 OPTION (RECOMPILE);
