
;WITH ranked AS (
SELECT c.RecId,c.InventoryId,c.StyleSampleTypeId,c.TranStatus,c.PlannedDate,c.ActualDate,c.ActualEndDate,c.UpdatedAt,t.ActivityName,
ROW_NUMBER() OVER (PARTITION BY c.InventoryId,c.StyleSampleTypeId,c.TranTypeId ORDER BY c.RecId DESC) AS rn
FROM dbo.CR_CustomerTransaction c LEFT JOIN dbo.CR_TransactionType t ON t.RecId=c.TranTypeId
WHERE ISNULL(c.IsDeleted,0)=0 AND c.InventoryId IN ({{MATCHED_IDS}}) AND c.TranTypeId IS NOT NULL)
SELECT RecId,InventoryId,StyleSampleTypeId,TranStatus,PlannedDate,ActualDate,ActualEndDate,UpdatedAt,ActivityName FROM ranked WHERE rn=1;
